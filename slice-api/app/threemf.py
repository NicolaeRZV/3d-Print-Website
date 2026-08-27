"""Extract printable meshes from a 3MF package into a binary STL (millimeters)."""
from __future__ import annotations

import struct
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

UNIT_TO_MM = {
    "micron": 0.001,
    "millimeter": 1.0,
    "centimeter": 10.0,
    "inch": 25.4,
    "foot": 304.8,
    "meter": 1000.0,
}

IDENTITY = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0)


def local_name(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def parse_transform(raw) -> tuple:
    if not raw:
        return IDENTITY
    parts = [p for p in str(raw).replace(",", " ").split() if p]
    if len(parts) != 12:
        return IDENTITY
    try:
        return tuple(float(p) for p in parts)
    except ValueError:
        return IDENTITY


def mul_transform(a: tuple, b: tuple) -> tuple:
    am = _to_matrix(a)
    bm = _to_matrix(b)
    rm = [[0.0, 0.0, 0.0, 0.0] for _ in range(4)]
    for i in range(4):
        for j in range(4):
            rm[i][j] = am[i][0] * bm[0][j] + am[i][1] * bm[1][j] + am[i][2] * bm[2][j] + am[i][3] * bm[3][j]
    return _from_matrix(rm)


def apply_transform(t: tuple, x: float, y: float, z: float) -> tuple:
    m00, m01, m02, m10, m11, m12, m20, m21, m22, m30, m31, m32 = t
    return (
        x * m00 + y * m10 + z * m20 + m30,
        x * m01 + y * m11 + z * m21 + m31,
        x * m02 + y * m12 + z * m22 + m32,
    )


def _to_matrix(t: tuple) -> list:
    m00, m01, m02, m10, m11, m12, m20, m21, m22, m30, m31, m32 = t
    return [
        [m00, m10, m20, m30],
        [m01, m11, m21, m31],
        [m02, m12, m22, m32],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _from_matrix(m: list) -> tuple:
    return (
        m[0][0], m[1][0], m[2][0],
        m[0][1], m[1][1], m[2][1],
        m[0][2], m[1][2], m[2][2],
        m[0][3], m[1][3], m[2][3],
    )


def attr_path(el: ET.Element) -> Optional[str]:
    for key, value in el.attrib.items():
        if (key == "path" or key.endswith("}path")) and value:
            return str(value).lstrip("/").replace("\\", "/")
    return None


def parse_mesh(mesh_el: ET.Element) -> list:
    verts = []
    triangles = []
    for child in mesh_el:
        name = local_name(child.tag)
        if name == "vertices":
            for vertex in child:
                if local_name(vertex.tag) != "vertex":
                    continue
                verts.append((float(vertex.get("x", "0")), float(vertex.get("y", "0")), float(vertex.get("z", "0"))))
        elif name == "triangles":
            count = len(verts)
            for tri in child:
                if local_name(tri.tag) != "triangle":
                    continue
                i0 = int(tri.get("v1", "0"))
                i1 = int(tri.get("v2", "0"))
                i2 = int(tri.get("v3", "0"))
                if i0 < 0 or i1 < 0 or i2 < 0 or i0 >= count or i1 >= count or i2 >= count:
                    continue
                triangles.append((verts[i0], verts[i1], verts[i2]))
    return triangles


def parse_model_xml(xml_bytes: bytes) -> tuple:
    text = xml_bytes.decode("utf-8-sig", errors="ignore")
    root = ET.fromstring(text)
    unit = (root.get("unit") or "millimeter").strip().lower()
    objects = {}
    build_items = []
    for el in root.iter():
        name = local_name(el.tag)
        if name == "object":
            oid = el.get("id")
            if not oid:
                continue
            mesh = []
            components = []
            for child in el:
                child_name = local_name(child.tag)
                if child_name == "mesh":
                    mesh = parse_mesh(child)
                elif child_name == "components":
                    for comp in child:
                        if local_name(comp.tag) != "component":
                            continue
                        cid = comp.get("objectid") or comp.get("objectId")
                        if not cid:
                            continue
                        components.append({"objectid": str(cid), "transform": parse_transform(comp.get("transform"))})
            objects[str(oid)] = {"mesh": mesh, "components": components, "path": attr_path(el)}
        elif name == "build":
            for item in el:
                if local_name(item.tag) != "item":
                    continue
                oid = item.get("objectid") or item.get("objectId")
                if not oid:
                    continue
                build_items.append({"objectid": str(oid), "transform": parse_transform(item.get("transform"))})
    return objects, build_items, unit


def _norm_zip_name(name: str) -> str:
    return name.replace("\\", "/").lstrip("/")


def _find_model_part(zf: zipfile.ZipFile, wanted: str) -> Optional[str]:
    wanted_n = _norm_zip_name(wanted).lower()
    for name in zf.namelist():
        n = _norm_zip_name(name).lower()
        if n == wanted_n or n.endswith("/" + wanted_n) or n.endswith(wanted_n):
            return name
    return None


def convert_3mf_to_stl(src: Path, dest: Path) -> dict:
    with zipfile.ZipFile(src, "r") as zf:
        model_names = [n for n in zf.namelist() if _norm_zip_name(n).lower().endswith(".model")]
        if not model_names:
            raise RuntimeError("3MF has no 3D model data")
        model_names.sort(key=lambda n: (0 if _norm_zip_name(n).lower().endswith("3d/3dmodel.model") else 1, _norm_zip_name(n).lower()))

        parsed = {}
        for name in model_names:
            parsed[_norm_zip_name(name)] = parse_model_xml(zf.read(name))

        primary_name = _norm_zip_name(model_names[0])
        objects, build_items, unit = parsed[primary_name]
        scale = UNIT_TO_MM.get(unit, 1.0)

        def file_objects(path_hint: Optional[str]) -> dict:
            if not path_hint:
                return objects
            found = _find_model_part(zf, path_hint)
            if not found:
                return objects
            extra, _, _ = parsed.get(_norm_zip_name(found), ({}, [], unit))
            return extra or objects

        def lookup(oid: str, path_hint: Optional[str]):
            local_objs = file_objects(path_hint)
            if oid in local_objs:
                return local_objs[oid]
            for _name, (objs, _build, _unit) in parsed.items():
                if oid in objs:
                    return objs[oid]
            return None

        def collect(oid: str, transform: tuple, stack: set, path_hint: Optional[str]) -> list:
            if oid in stack:
                return []
            obj = lookup(oid, path_hint)
            if not obj:
                return []
            next_hint = obj.get("path") or path_hint
            if obj.get("path"):
                obj = lookup(oid, obj["path"]) or obj
            tris = []
            for v0, v1, v2 in obj.get("mesh") or []:
                tris.append((apply_transform(transform, *v0), apply_transform(transform, *v1), apply_transform(transform, *v2)))
            next_stack = set(stack)
            next_stack.add(oid)
            for comp in obj.get("components") or []:
                child_t = mul_transform(transform, comp["transform"])
                tris.extend(collect(comp["objectid"], child_t, next_stack, next_hint))
            return tris

        all_tris = []
        if build_items:
            for item in build_items:
                all_tris.extend(collect(item["objectid"], item["transform"], set(), None))
        else:
            referenced = set()
            for obj in objects.values():
                for comp in obj.get("components") or []:
                    referenced.add(comp["objectid"])
            for oid, obj in objects.items():
                if oid in referenced:
                    continue
                if not obj.get("mesh") and not obj.get("components"):
                    continue
                all_tris.extend(collect(oid, IDENTITY, set(), obj.get("path")))

        if not all_tris and objects:
            for oid in objects:
                all_tris.extend(collect(oid, IDENTITY, set(), None))
                if all_tris:
                    break

    if not all_tris:
        raise RuntimeError("3MF contains no printable mesh")

    if abs(scale - 1.0) > 1e-12:
        scaled = []
        for v0, v1, v2 in all_tris:
            scaled.append((
                (v0[0] * scale, v0[1] * scale, v0[2] * scale),
                (v1[0] * scale, v1[1] * scale, v1[2] * scale),
                (v2[0] * scale, v2[1] * scale, v2[2] * scale),
            ))
        all_tris = scaled

    write_binary_stl(dest, all_tris)
    return {
        "triangleCount": len(all_tris),
        "objectCount": len(build_items) or len(objects),
        "unit": unit,
        "unitScale": scale,
    }


def write_binary_stl(path: Path, triangles: list) -> None:
    header = b"artblu-3mf".ljust(80, b"\0")
    out = bytearray(header)
    out += struct.pack("<I", len(triangles))
    for v0, v1, v2 in triangles:
        out += struct.pack("<12fH", 0.0, 0.0, 0.0, v0[0], v0[1], v0[2], v1[0], v1[1], v1[2], v2[0], v2[1], v2[2], 0)
    path.write_bytes(out)
