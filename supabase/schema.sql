-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- Extends the existing "3dmodels" table and sets up public STL storage.

-- Product columns (table already has: id bigint, category text, created_at timestamptz)
alter table public."3dmodels"
  add column if not exists slug text unique,
  add column if not exists name text not null default '',
  add column if not exists price numeric(10,2) not null default 0,
  add column if not exists old_price numeric(10,2),
  add column if not exists rating numeric(2,1) not null default 4.5,
  add column if not exists reviews integer not null default 0,
  add column if not exists badge text,
  add column if not exists emoji text default '📦',
  add column if not exists grad text default 'linear-gradient(135deg,#E4E8EF,#CDD4E0)',
  add column if not exists shape text default 'stand',
  add column if not exists material text default 'PLA mat',
  add column if not exists dims jsonb default '[10,10,10]',
  add column if not exists weight integer default 100,
  add column if not exists print_time numeric(4,1) default 3,
  add column if not exists infill integer default 20,
  add column if not exists finish text default 'Natural',
  add column if not exists description text default '',
  add column if not exists stl_path text,
  add column if not exists is_bestseller boolean not null default false,
  add column if not exists is_new_arrival boolean not null default false,
  add column if not exists is_deal boolean not null default false;

-- Public read for the storefront (anon key)
alter table public."3dmodels" enable row level security;

drop policy if exists "Public read 3dmodels" on public."3dmodels";
create policy "Public read 3dmodels"
  on public."3dmodels"
  for select
  to anon, authenticated
  using (true);

-- STL file storage bucket (upload files via Dashboard → Storage → stl-files)
insert into storage.buckets (id, name, public)
values ('stl-files', 'stl-files', true)
on conflict (id) do update set public = true;

drop policy if exists "Public read STL files" on storage.objects;
create policy "Public read STL files"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'stl-files');

-- Seed the 16 demo products (stl_path = filename inside stl-files bucket, e.g. p1.stl)
insert into public."3dmodels" (
  slug, name, category, price, old_price, rating, reviews, badge, emoji, grad,
  shape, material, dims, weight, print_time, infill, finish, description,
  stl_path, is_bestseller, is_new_arrival, is_deal
) values
  ('p1', 'Vază Fațetată Geometrică', 'Casă & Decor', 89.99, 119.99, 4.7, 238, 'Cel mai vândut', '🏺', 'linear-gradient(135deg,#CDEFE6,#A9E3D2)', 'vase', 'PLA mat', '[18,18,24]', 180, 7, 15, 'Vopsit manual, finisaj mat', 'Această vază cu fațete geometrice transformă orice colț al casei într-un mic obiect de design. Printată strat cu strat în PLA mat, are o structură ușoară dar rezistentă, perfectă pentru flori uscate sau aranjamente decorative.', 'p1.stl', true, false, true),
  ('p2', 'Set Ghivece de Perete Fagure (3 buc)', 'Grădină', 64.99, 79.99, 4.6, 112, null, '🪴', 'linear-gradient(135deg,#DFF2D8,#BFE6B3)', 'planter', 'PLA rezistent UV', '[10,10,9]', 95, 3, 20, 'Natural, fără vopsire', 'Setul de trei ghivece de perete în formă de fagure aduce un plus de verdeață fără să ocupe loc pe pervaz. Sistemul de prindere este inclus, iar materialul rezistă bine la umiditate și expunere la soare.', 'p2.stl', true, false, false),
  ('p3', 'Figurină Dragon Articulată', 'Jucării & Figurine', 54.99, null, 4.9, 401, 'Cel mai vândut', '🐉', 'linear-gradient(135deg,#E7DBF8,#D2BCF0)', 'figure', 'PLA+ articulat', '[22,8,10]', 140, 9, 10, 'Asamblat manual, fără lipire', 'Figurina de dragon are articulații funcționale, imprimate direct fără a fi nevoie de asamblare sau lipire. Poate fi mișcată și poziționată liber — un obiect de colecție care impresionează la fiecare detaliu.', 'p3.stl', true, false, false),
  ('p4', 'Suport Telefon Minimalist', 'Birou', 24.99, 34.99, 4.5, 560, null, '📱', 'linear-gradient(135deg,#D9E6FB,#B9D0F6)', 'stand', 'PETG transparent', '[9,7,10]', 60, 2, 25, 'Lustruit la bază', 'Suportul minimalist pentru telefon ține dispozitivul în unghiul perfect pentru apeluri video sau urmărit filme. Designul transparent din PETG se integrează discret pe orice birou.', 'p4.stl', true, false, true),
  ('p5', 'Organizator Modular de Cabluri', 'Birou', 19.99, null, 4.3, 98, null, '🔌', 'linear-gradient(135deg,#E4E8EF,#CDD4E0)', 'organizer', 'TPU flexibil', '[12,4,3]', 35, 1.5, 30, 'Flexibil, anti-zgârieturi', 'Organizatorul modular de cabluri pune capăt încurcăturilor de pe birou. Realizat din TPU flexibil, se montează ușor pe orice suprafață și acceptă cabluri de diverse grosimi.', 'p5.stl', true, false, false),
  ('p6', 'Lampă de Birou Topografică', 'Casă & Decor', 139.99, 169.99, 4.8, 76, 'Nou', '💡', 'linear-gradient(135deg,#FCEFD0,#F8DDA1)', 'lamp', 'PLA + LED inclus', '[16,16,30]', 320, 14, 20, 'Difuzor sablat', 'Lampa de birou cu suprafață topografică proiectează jocuri de lumină și umbră ca un relief de munte. Vine cu LED inclus și un difuzor sablat care oferă o lumină caldă, plăcută ochilor.', 'p6.stl', true, false, true),
  ('p7', 'Set de Șah Voronoi', 'Jucării & Figurine', 249.99, null, 4.9, 143, 'Premium', '♟️', 'linear-gradient(135deg,#D8DEEC,#B6C0DC)', 'chess', 'Rășină foto-curabilă', '[40,40,4]', 650, 22, 100, 'Lustruit, lac protector', 'Setul de șah Voronoi reinterpretează jocul clasic printr-o estetică organică, generată algoritmic. Printat în rășină foto-curabilă pentru detalii fine, fiecare piesă are o personalitate unică.', 'p7.stl', true, false, false),
  ('p8', 'Suport de Încărcare pentru Căști Wireless', 'Accesorii Tech', 34.99, 44.99, 4.4, 210, null, '🎧', 'linear-gradient(135deg,#FBE0DA,#F5BFB3)', 'stand', 'PLA mat', '[8,8,11]', 70, 3, 20, 'Cauciucat la bază', 'Suportul de încărcare pentru căști wireless ține dispozitivul stabil în timpul încărcării și eliberează spațiu pe birou. Baza cauciucată previne zgârierea suprafețelor.', 'p8.stl', true, false, false),
  ('p9', 'Set Breloc Personalizabil (5 buc)', 'Cadouri', 14.99, null, 4.2, 890, 'Cel mai vândut', '🔑', 'linear-gradient(135deg,#FCF1C7,#F8E296)', 'keychain', 'PLA multicolor', '[5,3,0.6]', 8, 0.5, 100, 'Margini șlefuite', 'Setul de cinci brelocuri personalizabile poate fi gravat cu inițiale sau un mesaj scurt la cerere. Perfect pentru cadouri rapide sau pentru a-ți marca cheile, bagajele sau rucsacul.', 'p9.stl', false, true, false),
  ('p10', 'Robot Jucărie Articulat', 'Jucării & Figurine', 44.99, 59.99, 4.7, 322, null, '🤖', 'linear-gradient(135deg,#D2F1F5,#A9E3EC)', 'figure', 'PLA+ articulat', '[14,9,18]', 160, 8, 15, 'Asamblat, fără lipire', 'Robotul jucărie are articulații mobile imprimate direct în piesă, fără șuruburi sau adezivi. Brațele, picioarele și capul se pot poziționa liber pentru joacă sau pentru fotografii.', 'p10.stl', false, true, true),
  ('p11', 'Suport Fațetat pentru Bijuterii', 'Casă & Decor', 29.99, null, 4.6, 156, null, '💍', 'linear-gradient(135deg,#FBDFEA,#F5BAD5)', 'ring', 'PETG perlat', '[7,7,12]', 55, 2.5, 20, 'Lustruit manual', 'Suportul fațetat pentru bijuterii combină funcționalitatea cu un aspect sculptural. Inelele, cerceii și brățările își găsesc locul perfect pe formele sale geometrice.', 'p11.stl', false, true, false),
  ('p12', 'Trio Organizatoare de Birou Stivuibile', 'Birou', 49.99, null, 4.5, 204, 'Nou', '🗄️', 'linear-gradient(135deg,#CFEFE8,#A6E1D4)', 'organizer', 'PLA mat', '[24,10,8]', 210, 6, 20, 'Natural', 'Trio-ul de organizatoare de birou stivuibile separă pixurile, agrafele și notițele într-un sistem compact. Se pot rearanja în funcție de spațiul disponibil pe birou.', 'p12.stl', false, true, false),
  ('p13', 'Diorama Castel Miniatural', 'Jucării & Figurine', 89.99, 109.99, 4.8, 67, null, '🏰', 'linear-gradient(135deg,#E9E5DD,#D3CBBC)', 'castle', 'PLA detaliat', '[20,20,16]', 280, 16, 12, 'Vopsit parțial manual', 'Diorama castelului miniatural recreează o fortăreață medievală cu turnuri, ziduri și porți detaliate. Un obiect de decor care funcționează la fel de bine pe un raft sau ca platformă pentru figurine.', 'p13.stl', false, true, false),
  ('p14', 'Ghiveci Cactus cu Auto-Udare', 'Grădină', 22.99, null, 4.4, 289, 'Eco', '🌵', 'linear-gradient(135deg,#DCF0D3,#B9E3A8)', 'planter', 'PLA rezistent la umiditate', '[9,9,11]', 75, 3, 20, 'Strat hidrofob', 'Ghiveciul de cactus cu auto-udare păstrează planta hidratată mai mult timp printr-un rezervor integrat în bază. Stratul hidrofob protejează materialul de umiditatea constantă.', 'p14.stl', false, true, false),
  ('p15', 'Suport Geometric pentru Ochelari de Soare', 'Cadouri', 19.99, null, 4.1, 54, null, '🕶️', 'linear-gradient(135deg,#FBE6D2,#F5CBA0)', 'stand', 'PLA mat', '[16,6,9]', 65, 2.5, 20, 'Natural', 'Suportul geometric pentru ochelari de soare ține lentilele protejate de zgârieturi atunci când nu le porți. Forma sculpturală funcționează și ca obiect decorativ pe noptieră sau birou.', 'p15.stl', false, true, false),
  ('p16', 'Suport Portabil pentru Boxă & Amplificator', 'Accesorii Tech', 27.99, 32.99, 4.6, 178, null, '🔊', 'linear-gradient(135deg,#DEDFF8,#BFC2F0)', 'stand', 'PLA+ ranforsat', '[10,10,13]', 110, 4, 25, 'Cauciucat la bază', 'Suportul portabil pentru boxă amplifică sunetul printr-o cavitate acustică integrată, fără cabluri sau baterii. Baza cauciucată previne vibrațiile și deplasarea pe masă.', 'p16.stl', false, true, true)
on conflict (slug) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  old_price = excluded.old_price,
  rating = excluded.rating,
  reviews = excluded.reviews,
  badge = excluded.badge,
  emoji = excluded.emoji,
  grad = excluded.grad,
  shape = excluded.shape,
  material = excluded.material,
  dims = excluded.dims,
  weight = excluded.weight,
  print_time = excluded.print_time,
  infill = excluded.infill,
  finish = excluded.finish,
  description = excluded.description,
  stl_path = excluded.stl_path,
  is_bestseller = excluded.is_bestseller,
  is_new_arrival = excluded.is_new_arrival,
  is_deal = excluded.is_deal;

-- Orders placed from the storefront checkout
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  customer_address text not null,
  items jsonb not null default '[]',
  subtotal numeric(10,2) not null default 0,
  status text not null default 'new'
);

alter table public.orders enable row level security;

grant insert on public.orders to anon, authenticated;

drop policy if exists "Public insert orders" on public.orders;
create policy "Public insert orders"
  on public.orders
  for insert
  to anon, authenticated
  with check (true);
