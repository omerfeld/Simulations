/* Exact first-band inverse Mathieu/Floquet calibration */
(() => {
'use strict';

const oldFrequencies = frequencies;
const oldMetrics = drawMetrics;
const oldBreakdown = drawBreakdown;
const oldDiagnostics = diagnostics;
const cache = new Map();

function characteristic(beta,q) {
  if (!(beta >= 0 && beta < 1)) return NaN;
  const target = Math.abs(q);
  if (target < 1e-12) return beta*beta;

  function residual(a,qq) {
    let sum=0, deriv=0;
    for(const b of [beta,-beta]) {
      let d=0,dd=0;
      for(let k=36;k>=1;k--) {
        const den=(2*k+b)**2-a-d;
        if(Math.abs(den)<1e-13) return [NaN,NaN];
        const next=qq*qq*(1+dd)/(den*den);
        d=qq*qq/den;
        dd=next;
      }
      sum+=d;
      deriv+=dd;
    }
    return [beta*beta-a-sum,-1-deriv];
  }

  let a=beta*beta;
  const steps=Math.max(8,Math.ceil(target*26));

  for(let i=1;i<=steps;i++) {
    const qi=target*i/steps;
    let converged=false;

    for(let j=0;j<24;j++) {
      const [r,dr]=residual(a,qi);
      if(!Number.isFinite(r) ||
         !Number.isFinite(dr) ||
         Math.abs(dr)<1e-12) return NaN;

      const step=Math.max(-0.4,Math.min(0.4,r/dr));
      a-=step;

      if(Math.abs(step)<2e-13) {
        converged=true;
        break;
      }
    }
    if(!converged) return NaN;
  }
  return a;
}

function calibrate(s,d) {
  const fd=s.rfKHz*1000;
  const beta=d.measured.map(v=>2*v/fd);
  const geom=[1,s.ratio,-(1+s.ratio)];

  if(beta.some(v=>!Number.isFinite(v)||v<=0||v>=1))
    return {error:
      'Reference frequencies must lie between 0 and RF/2 '+
      'for first-band Floquet calibration.'};

  const opticalA=d.refOp.delta.map(
    v=>4*v/(fd*fd)
  );

  function evaluate(q0) {
    const q=geom.map(g=>g*q0);
    const effective=q.map(
      (v,i)=>characteristic(beta[i],v)
    );

    if(effective.some(v=>!Number.isFinite(v)))
      return null;

    const a=effective.map(
      (v,i)=>v-opticalA[i]
    );

    return {
      q,a,effective,
      sum:a.reduce((x,y)=>x+y,0)
    };
  }

  let lo=0;
  let hi=2.25/Math.max(...geom.map(Math.abs));
  let left=evaluate(lo);
  let right=evaluate(hi);

  if(!left||!right||left.sum*right.sum>0)
    return {error:
      'No consistent first-band quadrupole fit. '+
      'Check RF drive, reference optics, and geometry.'};

  for(let n=0;n<48;n++) {
    const mid=(lo+hi)/2;
    const current=evaluate(mid);

    if(!current)
      return {error:'Mathieu inversion failed.'};

    if(left.sum*current.sum<=0) {
      hi=mid;
      right=current;
    } else {
      lo=mid;
      left=current;
    }
  }

  const fit=evaluate((lo+hi)/2);

  if(!fit||Math.abs(fit.sum)>1e-7)
    return {error:'RF inverse residual too large.'};

  for(let i=0;i<3;i++) {
    const check=floquet(
      fit.q[i],fit.effective[i],fd
    );

    if(check.unstable||check.f===null||
       Math.abs(check.f-d.measured[i])>0.5)
      return {error:
        'Reference frequencies fail forward validation.'};
  }

  return {
    fd,
    q:fit.q,
    a:fit.a,
    aSum:fit.sum,
    qmax:Math.max(...fit.q.map(Math.abs)),
    paulRF:fit.q.map(
      (q,i)=>floquet(q,fit.a[i],fd).f
    ),
    exactInverse:true
  };
}

function calibration(s,d) {
  const id=JSON.stringify([
    s.fHX,s.fHY,s.fHZ,s.rfKHz,s.ratio,
    s.refPower,s.refNA,s.refWaist,
    s.focusMode,s.lambda,s.waistFactor,
    s.radius,s.density,s.refractive,
    s.axis,s.focus
  ]);

  if(cache.has(id)) return cache.get(id);

  const result=calibrate(s,d);

  if(cache.size>12) cache.clear();
  cache.set(id,result);
  return result;
}

/* Replace only the inverse RF calculation */
frequencies=function(s) {
  if(s.inputMode!=='inverse'||s.model!=='floquet')
    return oldFrequencies(s);

  const d=decomposition(s);
  const fit=calibration(s,d);

  if(fit.error) {
    return {
      ...d,
      tp:{...trapParams(s,d.base),error:fit.error},
      result:d.base.map(()=>({
        f:null,unstable:false,incompatible:true
      }))
    };
  }

  const result=fit.q.map((q,i)=>
    floquet(
      q,
      fit.a[i]+4*d.op.delta[i]/(fit.fd*fit.fd),
      fit.fd
    )
  );

  return {...d,tp:fit,result};
};

/* Show measured reference and RF-only predictions */
drawMetrics=function(calc) {
  if(state.inputMode!=='inverse'||
     state.model!=='floquet')
    return oldMetrics(calc);

  $('metrics').innerHTML=keys.map((axis,i)=>{
    const f=calc.result[i].f;
    const paul=calc.tp.paulRF?.[i];
    const valid=f!==null&&Number.isFinite(f);
    const opt=calc.op.delta[i];

    return `<article class="panel metric"
       style="--metric-color:${colors[i]}">
      <div class="metric-top">
        <span class="axis" style="color:${colors[i]}">
          ${axis}
        </span>
        <span class="pill ${valid?'off':'warn'}">
          ${valid?'FLOQUET':'NO SOLUTION'}
        </span>
      </div>
      <div class="freq">
        ${valid?fmt(f,1):'—'}
        <small>Hz (RF model)</small>
      </div>
      <div class="metric-bottom">
        <span>
          Measured: ${fmt(calc.measured[i],1)} Hz<br>
          Paul-only:
          ${paul==null?'unstable':fmt(paul,1)+' Hz'}
        </span>
        <span>
          Optical curvature equivalent:<br>
          ${opt<0?'−':''}${fmt(Math.sqrt(Math.abs(opt)),1)} Hz
        </span>
      </div>
    </article>`;
  }).join('');
};

/* Exact Floquet frequencies do not add in f squared */
drawBreakdown=function(calc) {
  if(state.inputMode!=='inverse'||
     state.model!=='floquet')
    return oldBreakdown(calc);

  $('breakdownHeading').innerHTML=
    'Exact Floquet calibration: optical stiffness '+
    'modifies the Mathieu parameter, not an additive frequency.';

  $('breakdown').innerHTML=keys.map((axis,i)=>{
    if(calc.tp.error)
      return `<div class="breakdown-item">
        <strong>${axis}</strong>
        <p class="bad">${calc.tp.error}</p>
      </div>`;

    const paul=calc.tp.paulRF[i];
    const hybrid=calc.result[i].f;
    const referenceA=
      4*calc.refOp.delta[i]/calc.tp.fd**2;

    return `<div class="breakdown-item">
      <strong style="color:${colors[i]}">
        ${axis} · RF calibrated
      </strong>
      <div class="breakdown-equation">
        Measured: <b>${fmt(calc.measured[i],1)} Hz</b><br>
        Paul-only:
        <b>${paul==null?'unstable':fmt(paul,1)+' Hz'}</b><br>
        Current hybrid:
        <b>${hybrid==null?'unstable':fmt(hybrid,1)+' Hz'}</b>
        <br>
        <span class="muted">
          q = ${fmt(calc.tp.q[i],4)} ·
          a = ${fmt(calc.tp.a[i],5)} ·
          optical reference Δa = ${fmt(referenceA,5)}
        </span>
      </div>
    </div>`;
  }).join('');

  $('breakdownFootnote').textContent=
    'Three reference frequencies calibrate the ideal 3D '+
    'quadrupole using Σa = Σq = 0. The live optical '+
    'settings do not change the measured inputs.';
};

diagnostics=function(calc) {
  oldDiagnostics(calc);

  if(state.inputMode==='inverse'&&
     state.model==='floquet') {

    const box=$('warnings');

    if(calc.tp.error) {
      const title=box.querySelector('.validation-summary');
      const message=box.querySelector('p');

      if(title) title.textContent='RF calibration failed';
      if(message) {
        message.textContent=calc.tp.error;
        message.classList.add('bad');
      }

      $('validationTag').textContent='NO RF FIT';
      $('validationTag').className='pill warn';
    } else {
      box.innerHTML=box.innerHTML.replace(
        'Inverse separation uses the secular squared-frequency approximation. The inferred Paul component depends on reference power, beam size, particle polarizability and alignment.',
        'Inverse RF calibration matches the three measured reference frequencies directly, subject to the ideal quadrupole and first-band assumptions.'
      );
    }
  }
};

const previousRender=render;

render=function() {
  previousRender();

  if(state.inputMode==='inverse'&&
     state.model==='floquet')
    $('modelExplanation').textContent=
      'Exact constrained Mathieu inverse: the three '+
      'reference measurements are preserved. '+
      'Live optical changes predict new frequencies.';
};

render();
})();