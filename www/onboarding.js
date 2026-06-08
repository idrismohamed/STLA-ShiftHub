// ─── First-run onboarding wizard ──────────────────────────────────────────────
// A self-contained, multi-step "First Shift" setup flow shown only on the very
// first launch (tracked via sysSettings.hasSeenOnboarding). It writes directly
// into sysSettings, reuses the app's card/toggle/button styling, and animates
// step transitions with Motion.js. Built as its own full-screen overlay rather
// than a .bottom-sheet so it never collides with the shared sheet/overlay,
// history, or drag-to-dismiss logic in ui.js.

(function () {
    const CREWS = ['A', 'B', 'C', 'D'];

    // ── Working state ─────────────────────────────────────────────────────────
    let stepIndex   = 0;
    let crewMode    = 'know';        // 'know' | 'detect'
    let detectToday = null;          // 'D' | 'N' | 'O'

    /** Persist sysSettings to localStorage (mirrors the pattern used elsewhere). */
    function persist() {
        try { localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(sysSettings)); } catch (e) {}
    }

    // ── Date / rotation helpers ────────────────────────────────────────────────
    function todayUTC() {
        const n = new Date();
        return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
    }

    /** Return crew letters whose shift today matches the user's answer. */
    function detectCrews() {
        if (!detectToday) return CREWS.slice();
        const idxToday = getPIndex(todayUTC());
        return CREWS.filter(c => getShiftForCrew(idxToday, c) === detectToday);
    }

    /** Human label for the next worked (Day/Night) shift for a crew, or null. */
    function nextShiftLabel(crew) {
        const base = todayUTC();
        for (let i = 0; i < 28; i++) {
            const utc = base + i * MS_DAY;
            const s   = getShiftForCrew(getPIndex(utc), crew);
            if (s === 'D' || s === 'N') {
                const d = new Date(utc);
                return `${s === 'D' ? 'Day' : 'Night'}, ${daysOfWeek[d.getUTCDay()]} ${months[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
            }
        }
        return null;
    }

    const SHIFT_COLOR = { D: 'var(--day)', N: 'var(--night)', O: 'var(--off)' };
    const SHIFT_NAME  = { D: 'Day', N: 'Night', O: 'Off' };

    /** Build a read-only 14-day grid for the given crew so users confirm by sight. */
    function buildPreview(crew) {
        const wrap = el('div', 'ob-preview');
        const base = todayUTC();
        for (let i = 0; i < 14; i++) {
            const utc  = base + i * MS_DAY;
            const d    = new Date(utc);
            const s    = getShiftForCrew(getPIndex(utc), crew);
            const cell = el('div', 'ob-preview-cell');
            cell.style.setProperty('--c', SHIFT_COLOR[s]);
            cell.innerHTML =
                `<span class="ob-pc-dow">${daysOfWeek[d.getUTCDay()]}</span>` +
                `<span class="ob-pc-num">${d.getUTCDate()}</span>` +
                `<span class="ob-pc-shift">${s === 'O' ? 'Off' : s}</span>`;
            wrap.appendChild(cell);
        }
        return wrap;
    }

    // ── Tiny DOM helpers ────────────────────────────────────────────────────────
    function el(tag, cls, html) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }
    function toggleGroup(options, current, onPick, extraClass) {
        const g = el('div', 'toggle-group');
        options.forEach(o => {
            const b = el('div', 'toggle-btn' + (extraClass ? ' ' + extraClass : ''));
            b.textContent = o.label;
            if (o.value === current) b.classList.add('active');
            b.onclick = () => {
                haptic();
                g.querySelectorAll('.toggle-btn').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                onPick(o.value);
            };
            g.appendChild(b);
        });
        return g;
    }
    function switchRow(label, checked, onChange) {
        const row = el('div', 'ob-switch-row');
        row.appendChild(el('span', 'ob-switch-label', label));
        const sw = el('label', 'switch');
        const inp = el('input'); inp.type = 'checkbox'; inp.checked = !!checked;
        inp.onchange = () => { haptic(); onChange(inp.checked); };
        sw.appendChild(inp);
        sw.appendChild(el('span', 'switch-slider'));
        row.appendChild(sw);
        return row;
    }

    // ── Step definitions ──────────────────────────────────────────────────────
    // Each returns { body, footer, hideDots }.
    const steps = [
        // 0 — Welcome
        function welcome() {
            const body = el('div', 'ob-center');
            body.innerHTML =
                `<div class="ob-logo">🏭</div>` +
                `<h2 class="ob-title">Welcome to Shift Hub</h2>` +
                `<p class="ob-sub">Your rotating schedule, hours and pay — all in one place. Let's set it up so the calendar and paycheque are yours.</p>`;
            const footer = el('div', 'ob-footer ob-footer-stack');
            footer.appendChild(primaryBtn('Get started', next));
            footer.appendChild(textBtn('Skip for now', skip));
            return { body, footer, hideDots: true };
        },

        // 1 — Name
        function name() {
            const body = stepCard('What should we call you?', 'This is the name shown on your dashboard and paystubs.');
            const inp = el('input', 'text-input ob-input');
            inp.type = 'text';
            inp.placeholder = 'Your name';
            inp.value = (sysSettings.displayName && sysSettings.displayName !== 'Drizzy') ? sysSettings.displayName : '';
            inp.maxLength = 40;
            body.appendChild(inp);
            return {
                body,
                footer: navFooter(() => {
                    const v = inp.value.trim();
                    if (v) sysSettings.displayName = v;
                    next();
                })
            };
        },

        // 2 — Role & pay rate
        function role() {
            const body = stepCard('Your role & pay rate', 'Pick your default classification and confirm your hourly rates.');
            body.appendChild(toggleGroup(
                [{ label: 'Regular', value: 'Reg' }, { label: 'Team Leader', value: 'TL' }],
                sysSettings.defaultRole || 'Reg',
                v => { sysSettings.defaultRole = v; }, 'role-btn'
            ));
            body.appendChild(rateField('Regular rate ($/hr)', sysSettings.regRate, v => { if (v) sysSettings.regRate = v; }));
            body.appendChild(rateField('Team Leader rate ($/hr)', sysSettings.tlRate, v => { if (v) sysSettings.tlRate = v; }));
            return { body, footer: navFooter(next) };
        },

        // 3 — Find your crew
        function crew() {
            const body = stepCard('Find your crew', 'Your crew sets your whole rotation. Know it? Pick it. Not sure? Let us work it out.');

            const modeSwitch = toggleGroup(
                [{ label: 'I know my crew', value: 'know' }, { label: 'Help me find it', value: 'detect' }],
                crewMode, v => { crewMode = v; renderCrewBody(); }
            );
            body.appendChild(modeSwitch);

            const dyn = el('div', 'ob-crew-dyn');
            body.appendChild(dyn);

            function renderCrewBody() {
                dyn.innerHTML = '';
                if (crewMode === 'know') {
                    dyn.appendChild(el('div', 'ob-field-label', 'YOUR CREW'));
                    dyn.appendChild(toggleGroup(
                        CREWS.map(c => ({ label: 'Crew ' + c, value: c })),
                        sysSettings.defaultCrew || 'D',
                        v => { sysSettings.defaultCrew = v; }, 'crew-type'
                    ));
                } else {
                    dyn.appendChild(el('div', 'ob-field-label', 'WHAT ARE YOU WORKING TODAY?'));
                    dyn.appendChild(toggleGroup(
                        [{ label: '☀️ Day', value: 'D' }, { label: '🌙 Night', value: 'N' }, { label: '🚫 Off', value: 'O' }],
                        detectToday, v => { detectToday = v; evaluate(); }
                    ));
                    const result = el('div', 'ob-detect-result');
                    dyn.appendChild(result);

                    function evaluate() {
                        result.innerHTML = '';
                        if (!detectToday) return;
                        const matches = detectCrews();
                        if (matches.length === 1) {
                            // Unique — lock it in and confirm with a preview.
                            sysSettings.defaultCrew = matches[0];
                            result.innerHTML = `<div class="ob-detect-hit">✓ You're on <b>Crew ${matches[0]}</b></div>`;
                            result.appendChild(buildPreview(matches[0]));
                        } else {
                            // More than one crew shares this off/work pattern today —
                            // let the user pick the schedule that matches their reality.
                            result.appendChild(el('div', 'ob-field-label', 'TAP THE SCHEDULE THAT MATCHES YOURS'));
                            const list = el('div', 'ob-cand-list');
                            matches.forEach(c => {
                                const card = el('div', 'ob-cand-card' + (sysSettings.defaultCrew === c ? ' active' : ''));
                                card.appendChild(el('div', 'ob-cand-title', 'Crew ' + c));
                                card.appendChild(buildPreview(c));
                                card.onclick = () => {
                                    haptic();
                                    sysSettings.defaultCrew = c;
                                    list.querySelectorAll('.ob-cand-card').forEach(x => x.classList.remove('active'));
                                    card.classList.add('active');
                                };
                                list.appendChild(card);
                            });
                            result.appendChild(list);
                        }
                    }
                    if (detectToday) evaluate();
                }
            }
            renderCrewBody();
            return { body, footer: navFooter(next) };
        },

        // 4 — Live preview / confirm
        function preview() {
            const c = sysSettings.defaultCrew || 'D';
            const body = stepCard('This is your schedule', `Here are the next two weeks for Crew ${c}. Recognise it? You're all set.`);
            body.appendChild(buildPreview(c));
            const legend = el('div', 'ob-legend');
            ['D', 'N', 'O'].forEach(s => {
                const item = el('span', 'ob-legend-item');
                item.innerHTML = `<i style="background:${SHIFT_COLOR[s]}"></i>${SHIFT_NAME[s]}`;
                legend.appendChild(item);
            });
            body.appendChild(legend);
            return { body, footer: navFooter(next) };
        },

        // 5 — Notifications
        function notifications() {
            const body = stepCard('Shift reminders', 'Get a heads-up before each shift starts. You can change these anytime.');
            body.appendChild(switchRow('24-hour warning', sysSettings.notif24h, v => { sysSettings.notif24h = v; }));
            body.appendChild(switchRow('12-hour warning', sysSettings.notif12h, v => { sysSettings.notif12h = v; }));
            body.appendChild(switchRow('3-hour warning',  sysSettings.notif3h,  v => { sysSettings.notif3h  = v; }));
            body.appendChild(switchRow('Smart wake-up alarms', sysSettings.smartAlarms, v => { sysSettings.smartAlarms = v; }));
            return { body, footer: navFooter(next) };
        },

        // 6 — Theme
        function theme() {
            const body = stepCard('Pick your look', 'Choose a theme — it applies instantly.');
            body.appendChild(toggleGroup(
                [{ label: '🌙 Dark', value: 'dark' }, { label: '☀️ Light', value: 'light' }, { label: '⚙️ System', value: 'system' }],
                sysSettings.theme || 'system',
                v => { sysSettings.theme = v; applyTheme(v); }
            ));
            return { body, footer: navFooter(next) };
        },

        // 7 — Calendar sync
        function calSync() {
            const body = stepCard('Sync to your phone calendar?', 'Mirror your shifts into your device calendar so they show up alongside everything else.');
            body.appendChild(switchRow('Sync shifts to phone calendar', sysSettings.syncCalendar, v => { sysSettings.syncCalendar = v; }));
            return { body, footer: navFooter(finish, 'Finish') };
        },

        // 8 — Success
        function success() {
            const c = sysSettings.defaultCrew || 'D';
            const ns = nextShiftLabel(c);
            const body = el('div', 'ob-center');
            body.innerHTML =
                `<div class="ob-logo ob-logo-success">✓</div>` +
                `<h2 class="ob-title">You're set, ${escapeHtml(sysSettings.displayName || 'there')}.</h2>` +
                (ns ? `<p class="ob-sub">Your next shift is <b>${ns}</b>.</p>`
                    : `<p class="ob-sub">Your schedule is ready to go.</p>`);
            const footer = el('div', 'ob-footer ob-footer-stack');
            footer.appendChild(primaryBtn('Open my calendar', close));
            return { body, footer, hideDots: true };
        }
    ];

    // ── Shared step scaffolding ────────────────────────────────────────────────
    function stepCard(title, sub) {
        const body = el('div', 'ob-body');
        body.appendChild(el('h2', 'ob-title', escapeHtml(title)));
        if (sub) body.appendChild(el('p', 'ob-sub', escapeHtml(sub)));
        return body;
    }
    function rateField(label, value, onInput) {
        const wrap = el('div', 'ob-rate-field');
        wrap.appendChild(el('div', 'ob-field-label', label.toUpperCase()));
        const inp = el('input', 'number-input ob-input');
        inp.type = 'number'; inp.step = '0.01'; inp.value = (value != null ? value : '');
        inp.oninput = () => onInput(parseFloat(inp.value));
        wrap.appendChild(inp);
        return wrap;
    }
    function primaryBtn(label, onClick) {
        const b = el('button', 'btn-action btn-save ob-btn-primary'); b.textContent = label;
        b.onclick = () => { haptic(); onClick(); };
        return b;
    }
    function textBtn(label, onClick) {
        const b = el('button', 'ob-text-btn'); b.textContent = label;
        b.onclick = () => { haptic(); onClick(); };
        return b;
    }
    function navFooter(onNext, nextLabel) {
        const f = el('div', 'ob-footer');
        const back = el('button', 'btn-action btn-cancel'); back.textContent = 'Back';
        back.onclick = () => { haptic(); prev(); };
        f.appendChild(back);
        f.appendChild(primaryBtn(nextLabel || 'Next', onNext));
        return f;
    }
    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    // ── Render & navigation ─────────────────────────────────────────────────────
    function dots() {
        const wrap = el('div', 'ob-dots');
        // Welcome (0) and success (last) are not counted toward progress.
        const total = steps.length - 2;
        for (let i = 1; i <= total; i++) {
            const d = el('span', 'ob-dot' + (i === stepIndex ? ' active' : (i < stepIndex ? ' done' : '')));
            wrap.appendChild(d);
        }
        return wrap;
    }

    function render(dir) {
        const root = document.getElementById('onboarding-root');
        if (!root) return;
        const def = steps[stepIndex]();

        const card = el('div', 'ob-card');
        card.appendChild(def.body);
        if (!def.hideDots) card.appendChild(dots());
        card.appendChild(def.footer);

        root.innerHTML = '';
        root.appendChild(card);

        // Animate the card in (slide + fade) using Motion when available.
        const fromX = dir === 'back' ? -24 : 24;
        if (window.Motion && dir !== 'none') {
            window.Motion.animate(card,
                { opacity: [0, 1], transform: [`translateX(${fromX}px)`, 'translateX(0px)'] },
                { duration: 0.28, easing: [0.16, 1, 0.3, 1] });
        }
    }

    function go(index, dir) {
        stepIndex = Math.max(0, Math.min(steps.length - 1, index));
        sysSettings.onboardingStep = stepIndex;
        persist();
        render(dir);
    }
    function next() { go(stepIndex + 1, 'fwd'); }
    function prev() { go(stepIndex - 1, 'back'); }

    function teardown() {
        const root = document.getElementById('onboarding-root');
        if (root) { root.classList.remove('active'); setTimeout(() => { root.innerHTML = ''; }, 250); }
        document.body.style.overflow = '';
    }

    /** Commit completion, refresh the live app, then close. */
    function applyToApp() {
        const g = document.getElementById('greeting-text');
        if (g) g.innerHTML = `<span>${escapeHtml(sysSettings.displayName)}</span>`;
        const cSel = document.getElementById('crew-select');
        if (cSel) cSel.value = sysSettings.defaultCrew;
        applyTheme(sysSettings.theme);
        if (typeof invalidateFatigueCache === 'function') invalidateFatigueCache();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof updateNotifications === 'function') { try { updateNotifications(); } catch (e) {} }
    }

    function finish() {
        sysSettings.hasSeenOnboarding = true;
        delete sysSettings.onboardingStep;
        persist();
        applyToApp();
        stepIndex = steps.length - 1; // success screen
        render('fwd');
    }
    function close() {
        applyToApp();
        teardown();
        showToast('Setup complete — welcome aboard!');
    }
    function skip() {
        sysSettings.hasSeenOnboarding = true;
        delete sysSettings.onboardingStep;
        persist();
        teardown();
    }

    /** Public entry: open the wizard if the user hasn't seen it yet. */
    function maybeStartOnboarding() {
        if (sysSettings.hasSeenOnboarding) return;
        let root = document.getElementById('onboarding-root');
        if (!root) { root = el('div'); root.id = 'onboarding-root'; document.body.appendChild(root); }
        document.body.style.overflow = 'hidden';
        // Resume at the saved step if mid-flow (but never the success screen).
        const saved = sysSettings.onboardingStep;
        stepIndex = (typeof saved === 'number' && saved > 0 && saved < steps.length - 1) ? saved : 0;
        requestAnimationFrame(() => { root.classList.add('active'); render('none'); });
    }

    window.maybeStartOnboarding = maybeStartOnboarding;
}());
