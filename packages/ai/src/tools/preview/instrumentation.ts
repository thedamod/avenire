/** Installed by agent-browser before widget code, including deferred module scripts. */
export const instrumentation = String.raw`(() => {
  const state = { errors: [], frames: 0, pointerTargets: new WeakSet() };
  const push = (kind, message, stack) => {
    if (state.errors.length < 100) state.errors.push({kind, message: String(message).slice(0,2000), ...(stack ? {stack:String(stack).slice(0,4000)} : {})});
  };
  const contexts = [], tracked = new WeakSet();
  let glAttempts = 0, unavailableReported = false;
  const observeContext = (canvas, kind, context) => {
    if (/^(webgl2?|experimental-webgl)$/.test(kind)) glAttempts++;
    if (!context || tracked.has(context)) return context;
    if (!/^(2d|webgl2?|experimental-webgl)$/.test(kind)) return context;
    tracked.add(context);
    const info = {kind:kind==='experimental-webgl'?'webgl':kind,programsLinked:0,drawCalls:0,contextsLost:0,active:true};
    contexts.push(info);
    if (kind === '2d') return context;
    const wrap = (name, after) => {
      const native = context[name];
      if (typeof native !== 'function') return;
      context[name] = function(...args) {const result=native.apply(this,args);after(args);return result;};
    };
    wrap('compileShader', ([shader]) => {
      if (!context.getShaderParameter(shader,context.COMPILE_STATUS)) push('shader',context.getShaderInfoLog(shader)||'Shader compilation failed');
    });
    wrap('linkProgram', ([program]) => {
      if (context.getProgramParameter(program,context.LINK_STATUS)) info.programsLinked++;
      else push('shader',context.getProgramInfoLog(program)||'Shader program link failed');
    });
    const nativeGetError=context.getError.bind(context), pendingErrors=[];
    context.getError=()=>pendingErrors.length?pendingErrors.shift():nativeGetError();
    for (const name of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) wrap(name, () => {
      const error=nativeGetError();
      if (error===context.NO_ERROR) info.drawCalls++;
      else {if(!pendingErrors.includes(error))pendingErrors.push(error);push('webgl','WebGL error after '+name+': 0x'+error.toString(16));}
    });
    if (typeof canvas.addEventListener === 'function') {
      canvas.addEventListener('webglcontextlost',()=>{info.active=false;info.contextsLost++;push('webgl','WebGL context lost');});
      canvas.addEventListener('webglcontextrestored',()=>{info.active=true;});
    }
    return context;
  };
  for (const Canvas of [typeof HTMLCanvasElement==='undefined'?null:HTMLCanvasElement,typeof OffscreenCanvas==='undefined'?null:OffscreenCanvas]) {
    if (!Canvas) continue;
    const native = Canvas.prototype.getContext;
    Canvas.prototype.getContext = function(kind,...args) {return observeContext(this,kind,native.call(this,kind,...args));};
  }
  window.addEventListener('error', e => {
    if (e.target !== window) push('request', 'Failed resource: ' + (e.target.src || e.target.href || e.target.tagName));
    else push('exception', e.message, e.error && e.error.stack);
  }, true);
  window.addEventListener('unhandledrejection', e => push('unhandledrejection', e.reason && e.reason.message || e.reason, e.reason && e.reason.stack));
  window.addEventListener('securitypolicyviolation', e => push('csp', e.violatedDirective + ': ' + e.blockedURI));
  const fetch = window.fetch;
  window.fetch = function(...args) {
    const failed = error => {push('request', String(args[0]?.url || args[0]) + ': ' + (error?.message || error)); throw error;};
    try {return fetch.apply(this,args).catch(failed);} catch(error) {return failed(error);}
  };
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, ...args) {
    if (/^(pointer|mouse|touch)(down|move|start)$/.test(type)) state.pointerTargets.add(this);
    return add.call(this, type, ...args);
  };
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => { state.frames++; raf(tick); }; raf(tick);
  const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const name = el => el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim() || Array.from(el.labels || []).map(l => {const copy=l.cloneNode(true);copy.querySelectorAll('input,select,textarea,button').forEach(child=>child.remove());return copy.textContent;}).join(' ').trim() || el.textContent.trim().slice(0,120) || el.getAttribute('title') || '';
  state.controls = () => Array.from(document.querySelectorAll('button,input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=checkbox],[role=slider],canvas,svg')).filter(visible).map((el,i) => {
    // Attribute is reserved for this preview; ref discovery still uses snapshot -i.
    el.setAttribute('data-avenire-preview-control', String(i));
    const tag = el.tagName.toLowerCase(), type = el.type || '', pointer = /^(canvas|svg)$/.test(tag);
    const draggable = pointer && (state.pointerTargets.has(el) || el.onpointerdown || el.onmousedown || el.hasAttribute('onpointerdown') || el.hasAttribute('onmousedown') || getComputedStyle(el).cursor === 'grab');
    return {selector:'[data-avenire-preview-control="'+i+'"]', role:el.getAttribute('role') || ({button:'button',select:'combobox',textarea:'textbox',canvas:'figure',svg:'figure'}[tag]) || ({range:'slider',number:'spinbutton',checkbox:'checkbox',radio:'radio'}[type]) || 'textbox', name:name(el), type, tag, min:el.min, max:el.max, step:el.step, value:el.value, checked:!!el.checked, disabled:!!el.disabled, focusable:el.tabIndex >= 0, pointer, draggable:!!draggable, options:tag === 'select' ? Array.from(el.options).filter(o => !o.disabled).slice(0,6).map(o => o.value) : []};
  });
  state.measure = () => {
    const body = document.body;
    const text = body ? body.innerText.slice(0,20000) : '';
    const rendering = {canvas2d:0,webgl:0,webgl2:0,programsLinked:0,drawCalls:0,contextsLost:0};
    for (const item of contexts) {
      if (item.active) rendering[item.kind==='2d'?'canvas2d':item.kind]++;
      rendering.programsLinked+=item.programsLinked;rendering.drawCalls+=item.drawCalls;rendering.contextsLost+=item.contextsLost;
    }
    if (glAttempts&&!rendering.webgl&&!rendering.webgl2&&!unavailableReported) {push('webgl','No WebGL context could be created; any displayed fallback is not a shader render');unavailableReported=true;}
    return {text, rendering, frames:state.frames, errors:state.errors.splice(0), contentHeight:Math.ceil(body ? Math.max(body.scrollHeight, body.getBoundingClientRect().height) : 0), overflowX:document.documentElement.scrollWidth > innerWidth + 1 || !!body && body.scrollWidth > innerWidth + 1, nonfinite:/(?:NaN|Infinity)/.test(text)};
  };
  Object.defineProperty(window, '__avenirePreview', {value:state});
})();`;
