(function () {
  const CONTACT_EMAIL = 'contact@artblu.ro';

  function gmailComposeUrl(email, subject, body) {
    const params = new URLSearchParams();
    params.set('view', 'cm');
    params.set('fs', '1');
    params.set('to', email || CONTACT_EMAIL);
    if (subject) params.set('su', subject);
    if (body) params.set('body', body);
    return 'https://mail.google.com/mail/?' + params.toString();
  }

  window.artbluContactEmail = CONTACT_EMAIL;
  window.artbluGmailUrl = gmailComposeUrl;
  window.artbluContactGmailUrl = gmailComposeUrl(CONTACT_EMAIL);
})();
