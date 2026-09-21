export function handleKitchenTimer(event: MouseEvent): void {
 const target = event.target;
 if (!(target instanceof Element)) return;
 const button = target.closest<HTMLButtonElement>('[data-timer-toggle], [data-timer-reset]');
 const host = button?.closest<HTMLElement>('.timer');
 if (!button || !host || host.dataset.ready) return;
 host.dataset.ready = 'true';
 const output = host.querySelector<HTMLOutputElement>('[data-timer]')!;
 const toggle = host.querySelector<HTMLButtonElement>('[data-timer-toggle]')!;
 const reset = host.querySelector<HTMLButtonElement>('[data-timer-reset]')!;
 const status = host.querySelector<HTMLElement>('[role="status"]')!;
 let remaining = 720;
 let deadline = 0;
 let running = false;
 const render = () => {
  output.textContent = Math.floor(remaining / 60).toString().padStart(2, '0') + ':' + (remaining % 60).toString().padStart(2, '0');
  toggle.textContent = running ? 'Pause' : 'Start';
  toggle.setAttribute('aria-label', running ? 'Pause timer' : 'Start timer');
  status.textContent = remaining === 0 ? 'Time to check the sauce!' : '';
 };
 const onToggle = () => {
  if (running) remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  else {
   if (remaining === 0) remaining = 720;
   deadline = Date.now() + remaining * 1000;
  }
  running = !running;
  render();
 };
 const onReset = () => { running = false; remaining = 720; render(); };
 toggle.addEventListener('click', onToggle);
 reset.addEventListener('click', onReset);
 const interval = setInterval(() => {
  if (!host.isConnected) {
   clearInterval(interval);
   toggle.removeEventListener('click', onToggle);
   reset.removeEventListener('click', onReset);
   delete host.dataset.ready;
   return;
  }
  if (!running) return;
  remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (remaining === 0) running = false;
  render();
 }, 250);
 if (button === toggle) onToggle();
 else onReset();
}
