(async function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const slug = params.get('id');
  const errorEl = document.getElementById('error');

  if (!slug) {
    showError('No puzzle specified. Try the index page.');
    return;
  }

  let puzzle;
  try {
    const res = await fetch('puzzles/' + encodeURIComponent(slug) + '.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Puzzle "' + slug + '" not found.');
    puzzle = await res.json();
  } catch (e) {
    showError(e.message);
    return;
  }

  // --- Parse grid ---
  // grid is array of strings; "." (or "#") = block; letters = solution.
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const solution = puzzle.grid.map(r => r.toUpperCase().split(''));
  const isBlock = (r, c) => solution[r][c] === '.' || solution[r][c] === '#';

  // --- Number cells and build word list ---
  const numbers = Array.from({ length: rows }, () => Array(cols).fill(0));
  const cellsByPos = Array.from({ length: rows }, () => Array(cols).fill(null));
  const acrossWords = {}; // number -> {cells: [{r,c}], clue}
  const downWords = {};
  let n = 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (isBlock(r, c)) continue;
      const startsAcross = (c === 0 || isBlock(r, c - 1)) && (c + 1 < cols && !isBlock(r, c + 1));
      const startsDown = (r === 0 || isBlock(r - 1, c)) && (r + 1 < rows && !isBlock(r + 1, c));
      if (startsAcross || startsDown) {
        numbers[r][c] = n;
        if (startsAcross) {
          const cells = [];
          for (let cc = c; cc < cols && !isBlock(r, cc); cc++) cells.push({ r, c: cc });
          acrossWords[n] = { cells, clue: (puzzle.clues.across || {})[n] || '' };
        }
        if (startsDown) {
          const cells = [];
          for (let rr = r; rr < rows && !isBlock(rr, c); rr++) cells.push({ r: rr, c });
          downWords[n] = { cells, clue: (puzzle.clues.down || {})[n] || '' };
        }
        n++;
      }
    }
  }

  // --- State ---
  const state = {
    letters: Array.from({ length: rows }, () => Array(cols).fill('')),
    cursor: { r: 0, c: 0 },
    dir: 'across',
    solved: false,
    startTs: null,
  };
  // set cursor to first letter cell
  outer: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!isBlock(r, c)) { state.cursor = { r, c }; break outer; }

  // --- Render title & meta ---
  document.title = (puzzle.title || 'Mini') + ' — Mini Crosswords';
  document.getElementById('title').textContent = puzzle.title || 'Mini';

  // --- Build grid ---
  const gridEl = document.getElementById('grid');
  const cellSize = Math.max(40, Math.min(64, Math.floor(320 / Math.max(rows, cols))));
  gridEl.style.gridTemplateColumns = `repeat(${cols}, ${cellSize}px)`;
  gridEl.style.gridTemplateRows = `repeat(${rows}, ${cellSize}px)`;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r;
      cell.dataset.c = c;
      if (isBlock(r, c)) {
        cell.classList.add('block');
      } else {
        if (numbers[r][c]) {
          const nSpan = document.createElement('span');
          nSpan.className = 'num';
          nSpan.textContent = numbers[r][c];
          cell.appendChild(nSpan);
        }
        // circle marker (thematic association between words)
        if (puzzle.circles && puzzle.circles[r] && puzzle.circles[r][c] && puzzle.circles[r][c] !== '.') {
          cell.classList.add('circled');
        }
        const letterSpan = document.createElement('span');
        letterSpan.className = 'letter';
        cell.appendChild(letterSpan);
        cell.addEventListener('click', () => handleCellClick(r, c));
      }
      cellsByPos[r][c] = cell;
      gridEl.appendChild(cell);
    }
  }

  // --- Clue lists ---
  const acrossOl = document.getElementById('across');
  const downOl = document.getElementById('down');
  Object.entries(acrossWords).sort((a, b) => +a[0] - +b[0]).forEach(([num, w]) => {
    const li = document.createElement('li');
    li.dataset.num = num;
    li.dataset.dir = 'across';
    li.innerHTML = `<span class="n">${num}</span><span>${escapeHTML(w.clue)}</span>`;
    li.addEventListener('click', () => selectWord(+num, 'across'));
    acrossOl.appendChild(li);
  });
  Object.entries(downWords).sort((a, b) => +a[0] - +b[0]).forEach(([num, w]) => {
    const li = document.createElement('li');
    li.dataset.num = num;
    li.dataset.dir = 'down';
    li.innerHTML = `<span class="n">${num}</span><span>${escapeHTML(w.clue)}</span>`;
    li.addEventListener('click', () => selectWord(+num, 'down'));
    downOl.appendChild(li);
  });

  // --- Input handling ---
  const mobileInput = document.getElementById('mobile-input');
  const gridFocusable = gridEl;
  gridFocusable.focus();

  gridEl.addEventListener('keydown', handleKey);
  // For iOS/Android, focus the hidden input to summon keyboard on cell tap
  document.addEventListener('click', (e) => {
    if (e.target.closest('.cell') && !e.target.closest('.cell.block')) {
      mobileInput.focus({ preventScroll: true });
    }
  });
  mobileInput.addEventListener('keydown', handleKey);
  mobileInput.addEventListener('input', () => {
    const v = mobileInput.value;
    if (v) {
      for (const ch of v.toUpperCase()) if (/[A-Z]/.test(ch)) type(ch);
    }
    mobileInput.value = '';
  });

  document.getElementById('btn-check').addEventListener('click', checkGrid);
  document.getElementById('btn-reveal').addEventListener('click', revealAll);
  document.getElementById('btn-reveal-cell').addEventListener('click', revealCell);
  document.getElementById('btn-clear').addEventListener('click', clearGrid);

  render();

  // --- Fns ---
  function handleKey(e) {
    if (state.solved && !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    const k = e.key;
    if (k === ' ') { e.preventDefault(); state.dir = state.dir === 'across' ? 'down' : 'across'; render(); return; }
    if (k === 'Tab') { e.preventDefault(); nextWord(e.shiftKey); return; }
    if (k === 'ArrowLeft')  { e.preventDefault(); move(0, -1, 'across'); return; }
    if (k === 'ArrowRight') { e.preventDefault(); move(0,  1, 'across'); return; }
    if (k === 'ArrowUp')    { e.preventDefault(); move(-1, 0, 'down'); return; }
    if (k === 'ArrowDown')  { e.preventDefault(); move( 1, 0, 'down'); return; }
    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); backspace(); return; }
    if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); type(k.toUpperCase()); return; }
  }

  function type(letter) {
    const { r, c } = state.cursor;
    if (isBlock(r, c)) return;
    if (!state.startTs) startTimer();
    state.letters[r][c] = letter;
    // Clear wrong-mark on this cell
    cellsByPos[r][c].classList.remove('wrong');
    advance();
    render();
    checkIfSolved();
  }

  function backspace() {
    const { r, c } = state.cursor;
    if (state.letters[r][c]) {
      state.letters[r][c] = '';
      cellsByPos[r][c].classList.remove('wrong');
    } else {
      // go back one in current direction
      const dr = state.dir === 'down' ? -1 : 0;
      const dc = state.dir === 'across' ? -1 : 0;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nc >= 0 && !isBlock(nr, nc)) {
        state.cursor = { r: nr, c: nc };
        state.letters[nr][nc] = '';
        cellsByPos[nr][nc].classList.remove('wrong');
      }
    }
    render();
  }

  function advance() {
    const { r, c } = state.cursor;
    const dr = state.dir === 'down' ? 1 : 0;
    const dc = state.dir === 'across' ? 1 : 0;
    const nr = r + dr, nc = c + dc;

    // 1) Prefer next empty cell in the current word
    const word = currentWord();
    if (word) {
      const idx = word.cells.findIndex(cc => cc.r === r && cc.c === c);
      for (let i = idx + 1; i < word.cells.length; i++) {
        const cc = word.cells[i];
        if (!state.letters[cc.r][cc.c]) { state.cursor = cc; return; }
      }
    }

    // 2) Otherwise move one step in the current direction if possible
    if (nr < rows && nc < cols && nr >= 0 && nc >= 0 && !isBlock(nr, nc)) {
      state.cursor = { r: nr, c: nc };
      return;
    }

    // 3) End of word: jump to the first empty cell of the next same-direction word
    if (word) {
      const wordMap = state.dir === 'across' ? acrossWords : downWords;
      const nums = Object.keys(wordMap).map(Number).sort((a, b) => a - b);
      const curNum = +Object.entries(wordMap).find(([, w]) => w === word)[0];
      const order = nums.filter(n => n > curNum).concat(nums.filter(n => n <= curNum));
      for (const n of order) {
        const w = wordMap[n];
        const empty = w.cells.find(cc => !state.letters[cc.r][cc.c]);
        if (empty) { state.cursor = empty; return; }
      }
    }
  }

  function move(dr, dc, preferDir) {
    // change direction on axis change
    if (preferDir && state.dir !== preferDir) state.dir = preferDir;
    let { r, c } = state.cursor;
    while (true) {
      r += dr; c += dc;
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      if (!isBlock(r, c)) { state.cursor = { r, c }; render(); return; }
    }
  }

  function handleCellClick(r, c) {
    if (state.cursor.r === r && state.cursor.c === c) {
      state.dir = state.dir === 'across' ? 'down' : 'across';
    } else {
      state.cursor = { r, c };
    }
    render();
  }

  function currentWord() {
    const { r, c } = state.cursor;
    if (isBlock(r, c)) return null;
    if (state.dir === 'across') {
      // find start of across word
      let sc = c;
      while (sc > 0 && !isBlock(r, sc - 1)) sc--;
      const num = numbers[r][sc];
      return acrossWords[num] || null;
    } else {
      let sr = r;
      while (sr > 0 && !isBlock(sr - 1, c)) sr--;
      const num = numbers[sr][c];
      return downWords[num] || null;
    }
  }

  function nextWord(reverse) {
    const acrossNums = Object.keys(acrossWords).map(Number).sort((a, b) => a - b);
    const downNums = Object.keys(downWords).map(Number).sort((a, b) => a - b);
    const seq = acrossNums.map(n => ({ num: n, dir: 'across' }))
      .concat(downNums.map(n => ({ num: n, dir: 'down' })));
    if (!seq.length) return;

    let idx = -1;
    const word = currentWord();
    if (word) {
      const wordMap = state.dir === 'across' ? acrossWords : downWords;
      const entry = Object.entries(wordMap).find(([, w]) => w === word);
      if (entry) {
        const curNum = +entry[0];
        idx = seq.findIndex(s => s.num === curNum && s.dir === state.dir);
      }
    }
    idx = ((idx === -1 ? (reverse ? seq.length : -1) : idx) + (reverse ? -1 : 1) + seq.length) % seq.length;
    selectWord(seq[idx].num, seq[idx].dir);
  }

  function selectWord(num, dir) {
    const word = (dir === 'across' ? acrossWords : downWords)[num];
    if (!word) return;
    state.dir = dir;
    // move cursor to first empty cell in word, else first cell
    const first = word.cells.find(cc => !state.letters[cc.r][cc.c]) || word.cells[0];
    state.cursor = { r: first.r, c: first.c };
    render();
  }

  function render() {
    // clear highlights
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = cellsByPos[r][c];
      if (!cell || isBlock(r, c)) continue;
      cell.classList.remove('highlight', 'cursor');
      const ls = cell.querySelector('.letter');
      if (ls) ls.textContent = state.letters[r][c];
    }
    // highlight current word
    const word = currentWord();
    if (word) {
      word.cells.forEach(({ r, c }) => cellsByPos[r][c].classList.add('highlight'));
    }
    // cursor
    const cur = cellsByPos[state.cursor.r][state.cursor.c];
    if (cur) { cur.classList.remove('highlight'); cur.classList.add('cursor'); }

    // current clue banner
    const banner = document.getElementById('current-clue');
    banner.innerHTML = '';
    if (word) {
      const num = state.dir === 'across'
        ? Object.entries(acrossWords).find(([, w]) => w === word)?.[0]
        : Object.entries(downWords).find(([, w]) => w === word)?.[0];
      const numSpan = document.createElement('span');
      numSpan.className = 'num';
      numSpan.textContent = num + (state.dir === 'across' ? 'A' : 'D');
      const clueSpan = document.createElement('span');
      clueSpan.textContent = word.clue;
      banner.append(numSpan, clueSpan);
    }

    // active clue in list
    document.querySelectorAll('.clues li').forEach(li => li.classList.remove('active'));
    if (word) {
      const num = state.dir === 'across'
        ? Object.entries(acrossWords).find(([, w]) => w === word)?.[0]
        : Object.entries(downWords).find(([, w]) => w === word)?.[0];
      const li = document.querySelector(`.clues li[data-num="${num}"][data-dir="${state.dir}"]`);
      if (li) li.classList.add('active');
    }
  }

  function checkGrid() {
    let anyWrong = false;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (isBlock(r, c)) continue;
      const cell = cellsByPos[r][c];
      const filled = state.letters[r][c];
      if (filled && filled !== solution[r][c]) {
        cell.classList.add('wrong');
        anyWrong = true;
      } else {
        cell.classList.remove('wrong');
      }
    }
    if (!anyWrong) checkIfSolved();
  }

  function revealCell() {
    const { r, c } = state.cursor;
    if (isBlock(r, c)) return;
    state.letters[r][c] = solution[r][c];
    cellsByPos[r][c].classList.remove('wrong');
    render();
    checkIfSolved();
  }

  function revealAll() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (isBlock(r, c)) continue;
      state.letters[r][c] = solution[r][c];
      cellsByPos[r][c].classList.remove('wrong');
    }
    render();
    checkIfSolved();
  }

  function clearGrid() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      state.letters[r][c] = '';
      if (cellsByPos[r][c]) cellsByPos[r][c].classList.remove('wrong');
    }
    state.solved = false;
    document.getElementById('solved').classList.remove('show');
    stopTimer();
    render();
  }

  function checkIfSolved() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (isBlock(r, c)) continue;
      if (state.letters[r][c] !== solution[r][c]) return;
    }
    if (state.solved) return;
    state.solved = true;
    stopTimer();
    document.getElementById('solved').classList.add('show');
  }

  // --- Timer ---
  let timerInterval;
  function startTimer() {
    state.startTs = Date.now();
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }
  function stopTimer() { if (timerInterval) { clearInterval(timerInterval); timerInterval = null; } }
  function updateTimer() {
    if (!state.startTs) return;
    const s = Math.floor((Date.now() - state.startTs) / 1000);
    const m = Math.floor(s / 60);
    document.getElementById('timer').textContent = m + ':' + String(s % 60).padStart(2, '0');
  }

  function escapeHTML(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function showError(msg) {
    errorEl.hidden = false;
    errorEl.textContent = msg;
  }
})();
