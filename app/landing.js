const menuToggle = document.querySelector('#menuToggle');
const navLinks = document.querySelector('#navLinks');
const tabs = [...document.querySelectorAll('.walkthrough-tab')];
const stage = {
  kicker: document.querySelector('#stageKicker'),
  state: document.querySelector('#stageState'),
  title: document.querySelector('#stageTitle'),
  copy: document.querySelector('#stageCopy'),
  visual: document.querySelector('#stageVisual')
};

const steps = {
  commit: {
    kicker: 'STEP 01 · IMPLEMENTER', state: 'LOCAL HASHING',
    title: 'Turn a private work package into a public commitment.',
    copy: 'The browser calculates a SHA-256 commitment. The original file is not uploaded to Emberline; only its label and commitment enter the milestone history.',
    visual: '<div class="file-card"><span>PDF</span><div><strong>installation-report.pdf</strong><small>Private · 8.4 MB</small></div><b>LOCAL</b></div><div class="transform-arrow">→</div><div class="hash-card"><small>SHA-256 COMMITMENT</small><code>0x8d9c…c21f</code><span>FILE NOT UPLOADED</span></div>'
  },
  review: {
    kicker: 'STEP 02 · REVIEWER', state: 'INDEPENDENT DECISION',
    title: 'Bind one reviewer decision to one exact evidence revision.',
    copy: 'An assigned reviewer inspects the private package through the approved channel. Their approval or dispute is bound to the project, milestone, revision, commitment, and reviewer identity.',
    visual: '<div class="file-card"><span>R3</span><div><strong>Evidence revision 3</strong><small>commit 0x8d9c…c21f</small></div><b>BOUND</b></div><div class="transform-arrow">→</div><div class="hash-card"><small>REVIEW DECISION</small><code>APPROVED</code><span>REVIEWER + REVISION MATCH</span></div>'
  },
  quorum: {
    kicker: 'STEP 03 · POLICY', state: '2-OF-3 QUORUM',
    title: 'Count independent approvals without weakening the rules.',
    copy: 'The milestone policy counts unique authorized reviewers. A duplicate vote cannot raise the total, and one rejection freezes the gate until the implementer submits a new revision.',
    visual: '<div class="file-card"><span>2/3</span><div><strong>Independent approvals</strong><small>Technical + stakeholder</small></div><b>MET</b></div><div class="transform-arrow">→</div><div class="hash-card"><small>POLICY RESULT</small><code>QUORUM SATISFIED</code><span>NO REJECTIONS · UNIQUE VOTES</span></div>'
  },
  release: {
    kicker: 'STEP 04 · OWNER', state: 'SEQUENCE CHECKED',
    title: 'Release only the eligible tranche—never the whole escrow.',
    copy: 'After quorum is verified, the owner can release the current milestone amount. Earlier gates must already be complete, and replayed proofs or out-of-order releases remain blocked.',
    visual: '<div class="file-card"><span>✓</span><div><strong>Milestone 02 eligible</strong><small>Quorum and sequence satisfied</small></div><b>READY</b></div><div class="transform-arrow">→</div><div class="hash-card"><small>TRANCHE RELEASE</small><code>$8,000</code><span>AUDIT EVENT APPENDED</span></div>'
  }
};

function selectStep(name) {
  const data = steps[name];
  if (!data) return;
  tabs.forEach((tab) => {
    const selected = tab.dataset.step === name;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  stage.kicker.textContent = data.kicker;
  stage.state.textContent = data.state;
  stage.title.textContent = data.title;
  stage.copy.textContent = data.copy;
  stage.visual.innerHTML = data.visual;
}

menuToggle?.addEventListener('click', () => {
  const open = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});
navLinks?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  navLinks.classList.remove('open');
  menuToggle?.setAttribute('aria-expanded', 'false');
}));
tabs.forEach((tab) => tab.addEventListener('click', () => selectStep(tab.dataset.step)));

async function loadHealth() {
  const navStatus = document.querySelector('#navNetworkStatus');
  const heroIntegration = document.querySelector('#heroIntegration');
  const deploymentHealth = document.querySelector('#deploymentHealth');
  try {
    const response = await fetch('/health');
    if (!response.ok) throw new Error('Health unavailable');
    const health = await response.json();
    const ready = health?.attestcoin?.integrationReady === true && health?.chainMode === 'usc';
    navStatus.textContent = ready ? 'Attestcoin ready' : 'Testnet online';
    heroIntegration.textContent = ready ? 'Integration ready' : 'Configuration visible';
    deploymentHealth.textContent = ready ? 'USC integration ready' : 'Application operational';
  } catch {
    navStatus.textContent = 'Creditcoin Testnet';
    heroIntegration.textContent = 'Testnet deployment';
    deploymentHealth.textContent = 'Explorer links available';
  }
}

document.querySelector('#currentYear').textContent = String(new Date().getFullYear());
loadHealth();
