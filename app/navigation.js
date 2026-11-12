// Navigation côté navigateur : les formulaires et les appels CAP sont partagés.
const pages = [...document.querySelectorAll('[data-page]')];
const links = [...document.querySelectorAll('[data-nav]')];
function navigate(focus = true) {
  const requested = location.hash.slice(1) || 'accueil';
  const active = pages.find(page => page.dataset.page === requested) || pages[0];
  for (const page of pages) page.hidden = !window.stockLoggedIn || page !== active;
  for (const link of links) {
    if (link.dataset.nav === active.dataset.page) {link.setAttribute('aria-current','page');const group=link.closest('details');if(group)group.open=true;}
    else link.removeAttribute('aria-current');
  }
  if(window.StockI18n)window.StockI18n.updateTitle();
  else document.title = active.querySelector('.page-title').textContent + ' — Atelier Stock';
  // Chaque vue a son propre message : éviter un ancien succès sur une autre page.
  document.getElementById('message').textContent = '';
  if (focus) {active.querySelector('.page-title').focus({preventScroll:true});window.scrollTo(0,0);}
}
window.addEventListener('hashchange',()=>navigate());
window.addEventListener('stock:authenticated',()=>navigate(false));
navigate(false);

// Les grands raccourcis placent directement le curseur sur le premier champ utile.
document.addEventListener('click',event=>{
  const shortcut=event.target.closest('a[data-focus]');if(!shortcut)return;
  const focusField=()=>requestAnimationFrame(()=>{const target=document.getElementById(shortcut.dataset.focus);if(target&&!target.closest('[hidden]')){target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});}});
  if(location.hash===shortcut.hash)focusField();
  else window.addEventListener('hashchange',focusField,{once:true});
});
