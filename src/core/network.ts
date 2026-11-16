export type NetworkState = 'online'|'offline';
export function currentNetworkState():NetworkState{return navigator.onLine?'online':'offline';}
export function watchNetwork(onChange:(state:NetworkState)=>void):()=>void {
  const online=()=>onChange('online'),offline=()=>onChange('offline');
  window.addEventListener('online',online);window.addEventListener('offline',offline);
  onChange(currentNetworkState());
  return ()=>{window.removeEventListener('online',online);window.removeEventListener('offline',offline);};
}
