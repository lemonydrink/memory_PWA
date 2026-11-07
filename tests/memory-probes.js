// Observe resources without retaining their ports or detached application nodes.
window.__openCachePorts=0;
const NativeMessageChannel=window.MessageChannel;
window.MessageChannel=function(){
 const channel=new NativeMessageChannel();const close=channel.port1.close.bind(channel.port1);let closed=false;
 window.__openCachePorts++;
 channel.port1.close=()=>{if(!closed){closed=true;window.__openCachePorts--;}return close();};
 return channel;
};
// Fail after app.js has initialized, then verify retry does not execute it twice.
const appendBeforeProbe=Element.prototype.append;
window.__startupFailureInjected=false;
Element.prototype.append=function(...items){
 for(const item of items)if(item instanceof HTMLScriptElement&&item.getAttribute('src')==='/sync.js'&&!window.__startupFailureInjected){window.__startupFailureInjected=true;item.src='/missing-startup-probe.js';}
 return appendBeforeProbe.apply(this,items);
};
