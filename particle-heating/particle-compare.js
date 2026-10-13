/* Nanodiamond heating: independent 1–5 particle comparison.
   Existing steady-state thermal model is unchanged. */
(() => {
'use strict';

const COLORS = [
  '#64dfd3','#ffbd78','#aaa5ff','#8bedb8','#ff8792'
];
const VERSION = 'levitated-lab.nanodiamond-heating.v2';

let active = 0;
let particles = [];

const el = id => document.getElementById(id);
const alphaCm = (o,i) =>
  o['alpha'+i] * (o['alphaUnit'+i] === 'm' ? 0.01 : 1);

const fromSettings = o => ({
  name:'Particle 1',
  radius:o.radius,
  alpha1:alphaCm(o,1),
  alpha2:alphaCm(o,2)
});

const fresh = i => ({
  name:'Particle '+(i+1),
  radius:particles[active]?.radius ?? values().radius,
  alpha1:particles[active]?.alpha1 ?? alphaCm(values(),1),
  alpha2:particles[active]?.alpha2 ?? alphaCm(values(),2)
});

const originalUpdate = update;
const originalChart = chart;
const originalSweep = sweep;
const originalSanitize = sanitize;
const originalAssign = assign;

// Build the comparison controls.
const panel = document.createElement('section');
panel.className = 'panel';
panel.id = 'particleComparePanel';

panel.innerHTML = `
<h2>Compare particles <span class="chip">1–5</span></h2>
<p class="hint">
Each particle has independent radius and bulk absorption
coefficients. Optical powers, gas and radiation settings
are shared. Select a particle to show its energy budget
and inversion result.
</p>
<div class="field-grid">
  <div class="field">
    <label for="particleCount">Number of particles</label>
    <select id="particleCount">
      <option>1</option><option>2</option><option>3</option>
      <option>4</option><option>5</option>
    </select>
  </div>
  <div class="field">
    <label for="selectedParticle">
      Details / active particle
    </label>
    <select id="selectedParticle"></select>
  </div>
</div>
<div id="particleRows" class="particle-rows"></div>
<p class="hint" style="margin-top:9px">
Absorption coefficients use <b>cm⁻¹</b>
(bulk intensity attenuation).
For the selected particle, the original laser absorption
controls stay editable and synchronized.
</p>`;

document.querySelector('aside.controls section.panel')
  .insertAdjacentElement('afterend',panel);

const style = document.createElement('style');
style.textContent = `
.particle-rows {
 display:grid;gap:8px;margin-top:10px;
}
.particle-row {
 border:1px solid #33475f;
 background:#0d192a;border-radius:10px;padding:10px;
}
.particle-row.selected {border-color:#64dfd3}
.particle-row-top {
 display:flex;align-items:center;gap:7px;margin-bottom:8px;
}
.particle-dot {
 width:9px;height:9px;border-radius:100%;
 flex-shrink:0;
}
.particle-name {min-width:0;flex:1}
.particle-row-fields {
 display:grid;
 grid-template-columns:repeat(3,minmax(0,1fr));
 gap:7px;
}
.particle-row input {min-width:0}
.particle-row label {font-size:10px}
.particle-row input:not([type=checkbox]) {
 height:34px;padding:5px 6px;font-size:11px;
}
.particle-row-top input:not([type=checkbox]) {height:32px}
.particle-row .invalid {border-color:#e88587!important}
.legend .swatch {flex-shrink:0}
@media(max-width:440px) {
 .particle-row-fields {grid-template-columns:1fr 1fr}
 .particle-row-fields .field:first-child {
   grid-column:1/-1
 }
}`;
document.head.appendChild(style);

function validateParticle(p,o) {
  if (!p || typeof p !== 'object' ||
      typeof p.name !== 'string' ||
      !p.name.trim() || p.name.length > 70)
    throw Error('Particle name must be 1–70 characters.');

  for (const key of ['radius','alpha1','alpha2']) {
    if (typeof p[key] !== 'number' ||
        !Number.isFinite(p[key]))
      throw Error(p.name+': invalid '+key);
  }

  if (p.radius < 1 || p.radius > 1000)
    throw Error(p.name+': radius must be 1–1000 nm.');

  for (const i of [1,2]) {
    const a = p['alpha'+i];
    if (a < 0 ||
        alphaToK(a,'cm',o['lam'+i]) > 1)
      throw Error(
        p.name+': laser '+i+
        ' absorption implies k outside 0–1.'
      );
  }

  return {
    name:p.name.trim(),
    radius:p.radius,
    alpha1:p.alpha1,
    alpha2:p.alpha2
  };
}

function applyActive() {
  const p = particles[active];
  const o = values();
  if (!p) return;

  el('radius').value = String(p.radius);

  for (const i of [1,2]) {
    el('absMode'+i).value = 'alpha';

    const a = p['alpha'+i] *
      (o['alphaUnit'+i] === 'm' ? 100 : 1);

    el('alpha'+i).value = String(a);
    el('k'+i).value = String(
      alphaToK(p['alpha'+i],'cm',o['lam'+i])
    );
  }
}

function copyActiveFromMain() {
  const o = values();
  const p = particles[active];
  if (!p) return;

  p.radius = o.radius;
  p.alpha1 = alphaCm(o,1);
  p.alpha2 = alphaCm(o,2);

  for (const key of ['radius','alpha1','alpha2']) {
    const field = el('particle-'+active+'-'+key);
    if (field && document.activeElement !== field)
      field.value = String(p[key]);
  }
}

function drawControls() {
  el('particleCount').value = String(particles.length);

  const selector = el('selectedParticle');
  const rows = el('particleRows');
  selector.replaceChildren();
  rows.replaceChildren();

  particles.forEach((p,i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = p.name;
    selector.appendChild(option);

    const row = document.createElement('div');
    row.className = 'particle-row' +
      (i === active ? ' selected' : '');

    const top = document.createElement('div');
    top.className = 'particle-row-top';

    const dot = document.createElement('span');
    dot.className = 'particle-dot';
    dot.style.background = COLORS[i];
    top.appendChild(dot);

    const name = document.createElement('input');
    name.type = 'text';
    name.maxLength = 70;
    name.value = p.name;
    name.className = 'particle-name';
    name.id = 'particle-'+i+'-name';
    name.setAttribute(
      'aria-label','Particle '+(i+1)+' name'
    );
    top.appendChild(name);

    const fields = document.createElement('div');
    fields.className = 'particle-row-fields';

    const fieldDefs = [
      ['radius','Radius (nm)'],
      ['alpha1','α NIR (cm⁻¹)'],
      ['alpha2','α green (cm⁻¹)']
    ];

    for (const [key,label] of fieldDefs) {
      const wrap = document.createElement('div');
      wrap.className = 'field';

      const lab = document.createElement('label');
      lab.textContent = label;

      const input = document.createElement('input');
      input.type = 'number';
      input.id = 'particle-'+i+'-'+key;
      input.min = key === 'radius' ? '1' : '0';
      input.max = key === 'radius' ? '1000' : '1000000';
      input.step = 'any';
      input.value = String(p[key]);

      wrap.append(lab,input);
      fields.appendChild(wrap);

      input.addEventListener('change',() => {
        const n = Number(input.value);

        if (!Number.isFinite(n) ||
            n < (key === 'radius' ? 1 : 0) ||
            (key === 'radius' && n > 1000)) {
          input.classList.add('invalid');
          el('message').textContent =
            'Invalid '+label+' for '+p.name+'.';
          return;
        }

        try {
          validateParticle({...p,[key]:n},values());
        } catch(err) {
          input.classList.add('invalid');
          el('message').textContent = err.message;
          return;
        }

        input.classList.remove('invalid');
        p[key] = n;

        if (i === active) applyActive();
        update();
      });
    }

    name.addEventListener('change',() => {
      const newName = name.value.trim();

      if (!newName || newName.length > 70) {
        name.value = p.name;
        return;
      }

      p.name = newName;
      selector.options[i].textContent = p.name;
      update();
    });

    row.append(top,fields);
    rows.appendChild(row);
  });

  selector.value = String(active);
}

// Convert particle-specific absorption to the existing
// model's imaginary-index convention.
function modelFor(p,base) {
  return {
    ...base,
    radius:p.radius,
    k1:alphaToK(p.alpha1,'cm',base.lam1),
    k2:alphaToK(p.alpha2,'cm',base.lam2)
  };
}

function compareMessages() {
  const o = values();
  const messages = [];

  for (const p of particles) {
    const k1 = alphaToK(p.alpha1,'cm',o.lam1);
    const k2 = alphaToK(p.alpha2,'cm',o.lam2);

    if (!Number.isFinite(k1) ||
        !Number.isFinite(k2) ||
        k1 > 1 || k2 > 1)
      messages.push(
        p.name+': absorption implies k > 1, '+
        'beyond this Rayleigh implementation.'
      );

    if (o.laser2 &&
        p.radius > Math.min(o.lam1,o.lam2)*0.15)
      messages.push(
        p.name+': Rayleigh approximation may be '+
        'inaccurate at this radius.'
      );
  }

  return messages;
}

function graphComparison() {
  if (!particles.length) return;

  const base = values();

  for (const type of ['pressure','power','radius']) {
    const curves = [];
    let config;

    for (let i=0;i<particles.length;i++) {
      const p = particles[i];
      const result = originalSweep(modelFor(p,base),type);

      if (i === active) config = result.config;

      curves.push({
        name:p.name,
        color:COLORS[i],
        points:result.curves[0].points
      });
    }

    originalChart(type,curves,config);

    const legend = el('chart-'+type).nextElementSibling;

    if (legend &&
        legend.classList.contains('legend')) {
      legend.replaceChildren();

      particles.forEach((p,i) => {
        const item = document.createElement('span');
        const swatch = document.createElement('i');

        swatch.className = 'swatch';
        swatch.style.background = COLORS[i];

        item.appendChild(swatch);
        item.appendChild(document.createTextNode(
          p.name+(i === active ? ' · selected' : '')
        ));
        legend.appendChild(item);
      });
    }
  }

  const warnings = compareMessages();

  if (warnings.length) {
    const list = el('noticeList');

    for (const msg of warnings.slice(0,3)) {
      const li = document.createElement('li');
      li.textContent = msg;
      list.appendChild(li);
    }

    el('notice').classList.add('warning');
  }

  const title = panel.querySelector('h2');
  title.innerHTML =
    'Compare particles <span class="chip">' +
    particles.length+' active</span>';
}

// Retain the original renderer and add comparison overlays.
update = function() {
  originalUpdate();
  graphComparison();
};

el('particleCount').addEventListener('change',() => {
  const n = Number(el('particleCount').value);

  if (n > particles.length) {
    while (particles.length < n)
      particles.push(fresh(particles.length));
  } else {
    particles.length = n;
  }

  active = Math.min(active,n-1);
  drawControls();
  applyActive();
  update();
});

el('selectedParticle').addEventListener('change',() => {
  active = Number(el('selectedParticle').value);
  drawControls();
  applyActive();
  update();
});

// The selected particle stays synchronized with
// the original radius and absorption controls.
for (const id of [
  'radius','alpha1','alpha2','k1','k2',
  'absMode1','absMode2',
  'alphaUnit1','alphaUnit2','lam1','lam2'
]) {
  el(id).addEventListener('change',() => {
    copyActiveFromMain();
    drawControls();
    update();
  });
}

// Replace old export handlers, avoiding duplicate downloads.
function cleanButton(id) {
  const old = el(id);
  const replacement = old.cloneNode(true);
  old.replaceWith(replacement);
  return replacement;
}

function download(content,filename,type) {
  const url = URL.createObjectURL(
    new Blob([content],{type})
  );

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url),700);
}

const csv = value =>
  '"' + String(value).replaceAll('"','""') + '"';

function exportData(types) {
  const lines = [
    'sweep,variable,particle,base_radius_nm,'+
    'alpha_1560_cm^-1,alpha_532_cm^-1,temperature_K'
  ];

  for (const type of types) {
    const curveData = plotData[type] || [];

    for (let i=0;i<curveData.length;i++) {
      const p = particles[i];
      const curve = curveData[i];
      if (!p) continue;

      for (const pt of curve.points) {
        lines.push([
          type,
          pt.x,
          csv(p.name),
          p.radius,
          p.alpha1,
          p.alpha2,
          Number.isFinite(pt.y) ? pt.y : ''
        ].join(','));
      }
    }
  }

  const filename = types.length > 1
    ? 'nanodiamond_heating_all_particles.csv'
    : 'nanodiamond_'+types[0]+'_particles.csv';

  download(
    lines.join('\r\n')+'\r\n',
    filename,
    'text/csv;charset=utf-8'
  );
}

for (const button of document.querySelectorAll('[data-csv]')) {
  const type = button.dataset.csv;
  const replacement = button.cloneNode(true);

  button.replaceWith(replacement);

  replacement.addEventListener(
    'click',() => exportData([type])
  );
}

cleanButton('exportAll').addEventListener(
  'click',
  () => exportData(['pressure','power','radius'])
);

// Version 2 JSON includes all particle definitions.
cleanButton('saveBtn').addEventListener('click',() => {
  copyActiveFromMain();

  const profile = {
    schema:VERSION,
    date:new Date().toISOString(),
    model:'steady_state_rayleigh',
    settings:values(),
    activeParticle:active,
    particles
  };

  download(
    JSON.stringify(profile,null,2)+'\n',
    'nanodiamond-heating-particles.json',
    'application/json;charset=utf-8'
  );

  el('message').textContent =
    'Saved '+particles.length+
    ' particle(s), shared settings and selection.';
});

// Loading supports both old v1 and new v2 JSON.
const fileInput = (() => {
  const old = el('fileInput');
  const replacement = old.cloneNode(true);
  old.replaceWith(replacement);
  return replacement;
})();

cleanButton('loadBtn').addEventListener(
  'click',() => fileInput.click()
);

fileInput.addEventListener('change',async() => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    if (data.schema !== VERSION &&
        data.schema !== 'levitated-lab.nanodiamond-heating.v1')
      throw Error('Unsupported JSON profile schema.');

    const newSettings = originalSanitize(data.settings);
    let newParticles;
    let newActive = 0;

    if (data.schema === VERSION) {
      if (!Array.isArray(data.particles) ||
          data.particles.length < 1 ||
          data.particles.length > 5)
        throw Error('Profile must have 1–5 particles.');

      newParticles = data.particles.map(
        p => validateParticle(p,newSettings)
      );

      if (!Number.isInteger(data.activeParticle) ||
          data.activeParticle < 0 ||
          data.activeParticle >= newParticles.length)
        throw Error('Invalid active particle index.');

      newActive = data.activeParticle;
    } else {
      newParticles = [fromSettings(newSettings)];
    }

    // No changes until the whole file passes validation.
    particles = newParticles;
    active = newActive;

    originalAssign(newSettings);
    drawControls();
    applyActive();
    update();

    el('message').textContent =
      'Loaded '+particles.length+
      ' particle(s) from '+file.name+'.';

  } catch(err) {
    el('message').textContent =
      'Could not load JSON: '+err.message;
  }

  fileInput.value = '';
});

cleanButton('resetBtn').addEventListener('click',() => {
  particles = [fromSettings(DEFAULT)];
  active = 0;

  originalAssign(DEFAULT);
  drawControls();
  applyActive();
  update();

  el('inferResult').textContent =
    'Requires an independent internal-temperature '+
    'measurement (for example ODMR or Raman thermometry).';

  el('message').textContent =
    'Example particle restored.';
});

// Applying inverse absorption updates the selected particle.
el('applyFit').addEventListener('click',() => {
  requestAnimationFrame(() => {
    copyActiveFromMain();
    drawControls();
    update();
  });
});

// Initialize from existing calculator settings.
particles = [fromSettings(values())];
drawControls();
applyActive();
update();

})();
