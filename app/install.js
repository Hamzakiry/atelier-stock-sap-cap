(() => {
 let promptEvent;
 const button=document.getElementById('install-app'),help=document.getElementById('install-help');
 const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 button.hidden=installed();
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;button.hidden=false;});
 window.addEventListener('appinstalled',()=>{button.hidden=true;promptEvent=null;});
 button.addEventListener('click',async()=>{
  if(promptEvent){const event=promptEvent;promptEvent=null;await event.prompt();await event.userChoice;}
  else help.showModal();
 });
 const updateConnection=()=>{document.getElementById('offline-banner').hidden=navigator.onLine;};
 window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
 if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
})();
