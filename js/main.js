let currentData = null;

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('search-form');
  const input = document.getElementById('pdga-input');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pdgaNum = input.value.trim();
    if (!pdgaNum || !/^\d+$/.test(pdgaNum)) {
      showError('Please enter a valid PDGA number.');
      return;
    }
    await loadPlayer(pdgaNum);
  });
});

async function loadPlayer(pdgaNumber) {
  showLoading(true);
  hideError();
  hideResults();

  try {
    const res = await fetch(`/api/player?pdga=${encodeURIComponent(pdgaNumber)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `Error ${res.status}`);
    }
    const data = await res.json();
    currentData = data;
    renderResults(data);
  } catch (err) {
    showError(err.message);
  } finally {
    showLoading(false);
  }
}

function calcOverallAverage(rounds) {
  const last12Months = filterLast12Months(rounds);
  if (!last12Months.length) return null;
  const sum = last12Months.reduce((acc, r) => acc + r.rating, 0);
  return Math.round(sum / last12Months.length);
}

function calcTourAverage(rounds) {
  const TOUR_TIERS = new Set(['ES', 'M', 'NT', 'XM']);
  const last12Months = filterLast12Months(rounds);
  const tourRounds = last12Months.filter(r => TOUR_TIERS.has(r.tier?.toUpperCase()));
  if (!tourRounds.length) return null;
  const sum = tourRounds.reduce((acc, r) => acc + r.rating, 0);
  return Math.round(sum / tourRounds.length);
}

function calcOffTourAverage(rounds) {
  const TOUR_TIERS = new Set(['ES', 'M', 'NT', 'XM']);
  const last12Months = filterLast12Months(rounds);
  const offTourRounds = last12Months.filter(r => !TOUR_TIERS.has(r.tier?.toUpperCase()));
  if (!offTourRounds.length) return null;
  const sum = offTourRounds.reduce((acc, r) => acc + r.rating, 0);
  return Math.round(sum / offTourRounds.length);
}

function countTourRounds(rounds) {
  const TOUR_TIERS = new Set(['ES', 'M', 'NT', 'XM']);
  const last12Months = filterLast12Months(rounds);
  return last12Months.filter(r => TOUR_TIERS.has(r.tier?.toUpperCase())).length;
}

function countOffTourRounds(rounds) {
  const TOUR_TIERS = new Set(['ES', 'M', 'NT', 'XM']);
  const last12Months = filterLast12Months(rounds);
  return last12Months.filter(r => !TOUR_TIERS.has(r.tier?.toUpperCase())).length;
}

function countTotalRounds(rounds) {
  return filterLast12Months(rounds).length;
}

function filterLast12Months(rounds) {
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  return rounds.filter(r => {
    const dateStr = r.date || '';
    if (!dateStr) return false;
    // Parse dates like "24-Apr-2026" or "24-Apr to 26-Apr-2026"
    // Extract the year (last part, usually after the second date in a range)
    const match = dateStr.match(/(\d{1,2})-([A-Za-z]+)-(\d{4})/);
    if (!match) return false;
    const day = parseInt(match[1], 10);
    const month = new Date(`${match[2]} 1`).getMonth();
    const year = parseInt(match[3], 10);
    const date = new Date(year, month, day);
    return date >= oneYearAgo;
  });
}

function calcHandicapEquivalent(rounds) {
  const last20 = rounds.slice(0, 20);
  if (last20.length < 3) return null;

  const differentials = last20.map(r => 1000 - r.rating);
  const sorted = [...differentials].sort((a, b) => a - b);
  const count = Math.min(8, sorted.length);
  const best8 = sorted.slice(0, count);

  const avgDiff = best8.reduce((a, b) => a + b, 0) / count;
  const adjustedDiff = avgDiff * 0.96;

  return Math.round(1000 - adjustedDiff);
}

function calcStandardDeviation(rounds) {
  const last12Months = filterLast12Months(rounds);
  if (last12Months.length < 2) return null;

  const ratings = last12Months.map(r => r.rating);
  const mean = ratings.reduce((acc, r) => acc + r, 0) / ratings.length;
  const variance = ratings.reduce((acc, r) => acc + Math.pow(r - mean, 2), 0) / ratings.length;
  const stdDev = Math.sqrt(variance);

  return Math.round(stdDev * 100) / 100;
}

function renderResults(data) {
  document.getElementById('player-name').textContent = data.name;
  document.getElementById('player-pdga').textContent = `PDGA #${data.pdgaNumber}`;
  document.getElementById('player-rating').textContent = data.currentRating ?? 'N/A';
  document.getElementById('player-location').textContent = data.location || 'Location unknown';

  const overall = calcOverallAverage(data.rounds);
  const tour = calcTourAverage(data.rounds);
  const offTour = calcOffTourAverage(data.rounds);
  const handicap = calcHandicapEquivalent(data.rounds);
  const stdDev = calcStandardDeviation(data.rounds);
  const totalCount = countTotalRounds(data.rounds);
  const tourCount = countTourRounds(data.rounds);
  const offTourCount = countOffTourRounds(data.rounds);

  document.getElementById('metric-overall').textContent = overall ?? 'N/A';
  document.getElementById('metric-overall-subtitle').textContent = `${totalCount} round${totalCount !== 1 ? 's' : ''}`;
  document.getElementById('metric-tour').textContent = tour ?? 'N/A';
  document.getElementById('metric-tour-subtitle').textContent = `${tourCount} tour round${tourCount !== 1 ? 's' : ''}`;
  document.getElementById('metric-offtour').textContent = offTour ?? 'N/A';
  document.getElementById('metric-offtour-subtitle').textContent = `${offTourCount} off-tour round${offTourCount !== 1 ? 's' : ''}`;
  document.getElementById('metric-handicap').textContent = handicap ?? 'N/A';
  document.getElementById('metric-stdev').textContent = stdDev ?? 'N/A';

  const tbody = document.getElementById('rounds-tbody');
  tbody.innerHTML = '';
  const last20 = data.rounds.slice(0, 20);

  const TOUR_TIERS = new Set(['ES', 'M', 'NT', 'XM']);

  last20.forEach(round => {
    const tr = document.createElement('tr');
    const isTour = TOUR_TIERS.has(round.tier?.toUpperCase());
    const tierBadgeClass = isTour
      ? 'bg-indigo-100 text-indigo-800'
      : 'bg-gray-100 text-gray-700';

    tr.innerHTML = `
      <td class="px-4 py-2 text-sm text-gray-600 whitespace-nowrap">${escHtml(round.date)}</td>
      <td class="px-4 py-2 text-sm text-gray-800">${escHtml(round.event)}</td>
      <td class="px-4 py-2">
        <span class="px-2 py-0.5 rounded text-xs font-medium ${tierBadgeClass}">
          ${escHtml(round.tier || '—')}
        </span>
      </td>
      <td class="px-4 py-2 text-sm font-mono font-semibold text-gray-900 text-right">${round.rating}</td>
    `;
    tbody.appendChild(tr);
  });

  showResults();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showLoading(visible) {
  document.getElementById('loading').classList.toggle('hidden', !visible);
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  document.getElementById('error-msg').classList.add('hidden');
}

function showResults() {
  document.getElementById('results').classList.remove('hidden');
}

function hideResults() {
  document.getElementById('results').classList.add('hidden');
}
