// ─── First-run guided coachmarks ─────────────────────────────────────────────
// A one-time spotlight tour shown after onboarding (and once for existing users
// on update). Each step dims the screen, cuts a "hole" around a target element
// and shows a caption explaining it. Covers the pay period, schedule/shift
// logging, the CPP/EI caps, the time-off rings and Settings. Replayable from
// Settings. Tracked via sysSettings.hasSeenCoachmarks.

(function () {
    const STEPS = [
        { sel: '.pp-top-tap', title: 'Your pay period',
          body: 'Gross, net and hours for this pay. Tap it any time to open the full breakdown and Pay Tools (paystub verifier, CPP/EI caps, T4 estimate, bonus/VCP).' },
        { sel: '#calendar', title: 'Your schedule',
          body: 'Tap any day to log a shift or pick up extra hours — classify them as OT (1.5×) or DT (2×). Long-press a day for quick actions.' },
        { sel: '#chart-rings', title: 'CPP & EI caps',
          body: 'How close your CPP and EI are to the yearly maximum. Once they max out they stop coming off — and your cheque goes up.' },
        { sel: '#chart-timeoff', title: 'Time off',
          body: 'Vacation, banked holiday (lieu) and drop days at a glance. Tap any ring to see when and where you used them.' },
        { sel: '.app-header-settings-btn', title: 'Settings',
          body: 'Your name, crew, pay rates, tax tables and rotation live here — and you can replay this tour anytime.' }
    ];

    let _steps = [], _i = 0, _root = null;

    function persistSeen() {
        sysSettings.hasSeenCoachmarks = true;
        try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
    }

    function build() {
        const root = document.createElement('div');
        root.id = 'coach-root';
        root.innerHTML =
            `<div class="coach-hole"></div>
             <div class="coach-tip">
               <div class="coach-progress"></div>
               <div class="coach-title"></div>
               <div class="coach-body"></div>
               <div class="coach-actions">
                 <button class="coach-skip">Skip</button>
                 <span style="flex:1"></span>
                 <button class="coach-prev">Back</button>
                 <button class="coach-next btn-action btn-save">Next</button>
               </div>
             </div>`;
        document.body.appendChild(root);
        root.querySelector('.coach-skip').onclick = end;
        root.querySelector('.coach-prev').onclick = prev;
        root.querySelector('.coach-next').onclick = next;
        // Tapping the dimmed area (not the caption) advances.
        root.addEventListener('click', e => { if (!e.target.closest('.coach-tip')) next(); });
        return root;
    }

    function position(step) {
        const target = document.querySelector(step.sel);
        if (!target) { next(); return; }                 // skip a missing target
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => {
            const r = target.getBoundingClientRect();
            const pad = 8;
            const hole = _root.querySelector('.coach-hole');
            hole.style.left = Math.max(4, r.left - pad) + 'px';
            hole.style.top = Math.max(4, r.top - pad) + 'px';
            hole.style.width = Math.min(window.innerWidth - 8, r.width + pad * 2) + 'px';
            hole.style.height = (r.height + pad * 2) + 'px';

            const tip = _root.querySelector('.coach-tip');
            _root.querySelector('.coach-title').textContent = step.title;
            _root.querySelector('.coach-body').textContent = step.body;
            _root.querySelector('.coach-progress').textContent = `${_i + 1} of ${_steps.length}`;
            _root.querySelector('.coach-prev').style.visibility = _i === 0 ? 'hidden' : 'visible';
            _root.querySelector('.coach-next').textContent = _i === _steps.length - 1 ? 'Done' : 'Next';

            // Place the caption above or below the target, whichever fits.
            tip.style.visibility = 'hidden';
            requestAnimationFrame(() => {
                const th = tip.offsetHeight;
                const below = r.bottom + 14;
                let top;
                if (below + th < window.innerHeight - 12) top = below;
                else if (r.top - th - 14 > 12) top = r.top - th - 14;
                else top = Math.max(12, window.innerHeight - th - 12);
                tip.style.top = top + 'px';
                tip.style.visibility = 'visible';
            });
        }, 330);
    }

    function go(i) { _i = i; position(_steps[_i]); }
    function next() { if (_i < _steps.length - 1) go(_i + 1); else end(); }
    function prev() { if (_i > 0) go(_i - 1); }

    function end() {
        if (_root) _root.classList.remove('active');
        document.body.style.overflow = '';
        persistSeen();
    }

    function start() {
        if (!_root) _root = build();
        _steps = STEPS.filter(s => document.querySelector(s.sel));
        if (!_steps.length) return;
        document.body.style.overflow = 'hidden';
        _root.classList.add('active');
        go(0);
    }

    /** Show the tour once, unless it's already been seen or something is in the way. */
    function maybeStart() {
        if (sysSettings.hasSeenCoachmarks) return;
        const ob = document.getElementById('onboarding-root');
        if (ob && ob.classList.contains('active')) return;             // onboarding still up
        if (typeof _sheetStack !== 'undefined' && _sheetStack.length) return; // a sheet is open
        start();
    }

    /** Replay from Settings. */
    function replay() {
        sysSettings.hasSeenCoachmarks = false;
        try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
        if (typeof closeAllSheets === 'function') closeAllSheets();
        setTimeout(start, 400);
    }

    // Reposition the current step if the viewport changes mid-tour.
    window.addEventListener('resize', () => { if (_root && _root.classList.contains('active')) position(_steps[_i]); });

    window.startCoachmarks = start;
    window.maybeStartCoachmarks = maybeStart;
    window.replayCoachmarks = replay;
}());
