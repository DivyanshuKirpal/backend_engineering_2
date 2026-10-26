// useSecurityPresenter (section 5, SecurityPage): two-factor on or off, with
// turning it on (a QR code, then a code) or off (the password and a code);
// changing the password, which signs out every other device; the signed-in
// devices, each of which can be signed out; and recent security activity
// from the audit log. The simulator's authenticator code is always 123456.

import * as userApi from '../../models/api/user.api.js';
import { strength, MIN_LENGTH } from '../../models/domain/password.rules.js';
import { session, setUser } from '../../models/stores/session.store.js';
import { createPresenter } from '../shared/presenter.js';
import { createCursorList } from '../shared/cursorList.js';
import { toast, errorToast } from '../shared/toasts.js';
import { DEMO_CODE } from '../shared/demoAccounts.js';
import { strengthMeter } from '../auth/register.presenter.js';
import { fullDate, listTime, relativeDay } from '../formatters/date.format.js';
import { activityLabel, isWarningActivity } from '../formatters/status.format.js';

const ACTIVITY_PAGE = 10;
const PHONE = /iPhone|iPad|Android/;

export function createSecurityPresenter() {
  const p = createPresenter();
  const user = () => session.get().user;

  let current = '';
  let next = '';
  let repeat = '';
  let pwErrors = {};
  let pwBusy = false;

  let devices = { status: 'loading', list: [] };
  const revoking = new Set();
  let revokingAll = false;

  // The two-factor dialog: null, or { mode: 'enable' | 'disable', ... }
  let dialog = null;

  p.own(session.subscribe(() => p.changed()));
  const activity = createCursorList(p, ({ cursor, limit }) => userApi.activity({ cursor, limit }), { limit: ACTIVITY_PAGE });
  activity.reset();

  /** This device first, then the others in the order they signed in (as drawn). */
  const inOrder = (list) => [...list].sort((a, b) => Number(b.current) - Number(a.current) || a.createdAt.localeCompare(b.createdAt));

  async function loadDevices() {
    try {
      const data = await userApi.sessions();
      if (p.disposed) return;
      devices = { status: 'ready', list: inOrder(data.sessions) };
    } catch {
      if (p.disposed) return;
      devices = { status: 'error', list: [] };
    }
    p.changed();
  }
  loadDevices();

  async function refreshUser() {
    const { user: fresh } = await userApi.me();
    if (!p.disposed) setUser(fresh);
  }

  function checkPasswords() {
    const e = {};
    if (!current) e.current = 'Enter your current password.';
    const s = strength(next);
    if (!next) e.next = 'Choose a new password.';
    else if (!s.longEnough) e.next = `Use at least ${MIN_LENGTH} characters.`;
    else if (s.score < 2) e.next = 'Make it a little stronger: longer, or with a number or symbol.';
    else if (next === current) e.next = 'Choose a password you haven\'t used here.';
    if (next && !e.next && repeat !== next) e.repeat = 'The two new passwords don\'t match.';
    return e;
  }

  function twoFactorVm(u) {
    return u.twoFactorEnabled
      ? {
        on: true,
        title: 'Two-factor authentication is on',
        body: `${u.twoFactorEnabledAt ? `Since ${fullDate(u.twoFactorEnabledAt)}. ` : ''}Logging in and withdrawing both ask for a code from your authenticator app.`,
        action: 'Turn off',
      }
      : {
        on: false,
        title: 'Two-factor authentication is off',
        body: 'Turn it on and logging in and withdrawing will ask for a code from your authenticator app as well as your password.',
        action: 'Turn on',
      };
  }

  function dialogVm(u) {
    if (!dialog) return null;
    const common = {
      code: dialog.code,
      codeError: dialog.codeError,
      busy: dialog.busy,
      demoHint: `This is a simulator: the code is always ${DEMO_CODE}.`,
    };
    if (dialog.mode === 'enable') {
      return {
        ...common,
        mode: 'enable',
        title: 'Turn on two-factor',
        loading: !dialog.setup,
        failed: dialog.failed,
        qr: dialog.setup?.otpauthUrl ?? null,
        manualKey: dialog.setup?.manualKey ?? null,
        confirm: 'Turn on',
      };
    }
    return {
      ...common,
      mode: 'disable',
      title: 'Turn off two-factor?',
      body: 'Logging in and withdrawing will then need only your password.',
      askPassword: u.hasPassword,
      password: dialog.password,
      passwordError: dialog.passwordError,
      confirm: 'Turn off',
    };
  }

  async function startSetup() {
    try {
      const setup = await userApi.setupTwoFactor();
      if (!dialog || dialog.mode !== 'enable') return;
      dialog = { ...dialog, setup, failed: false };
    } catch (err) {
      if (!dialog) return;
      dialog = { ...dialog, failed: true };
      errorToast('Two-factor setup didn\'t start', err);
    }
    p.changed();
  }

  return {
    get vm() {
      const u = user();
      if (!u) return { status: 'loading' };
      const others = devices.list.filter((d) => !d.current);
      return {
        status: 'ready',
        twoFactor: twoFactorVm(u),
        dialog: dialogVm(u),
        password: u.hasPassword
          ? {
            current,
            next,
            repeat,
            errors: pwErrors,
            meter: strengthMeter(next),
            busy: pwBusy,
          }
          : null,
        devices: {
          status: devices.status,
          title: devices.status === 'ready' ? `Signed-in devices · ${devices.list.length}` : 'Signed-in devices',
          canSignOutOthers: others.length > 0 && !revokingAll,
          signingOutOthers: revokingAll,
          rows: devices.list.map((d) => ({
            key: d.id,
            name: d.device,
            kind: PHONE.test(d.device) ? 'phone' : 'monitor',
            current: d.current,
            when: d.current ? 'Active now' : `Last used ${relativeDay(d.lastUsedAt)}`,
            ip: d.ip,
            busy: revoking.has(d.id),
          })),
        },
        activity: {
          status: activity.status,
          rows: activity.items.map((a, i) => ({
            key: `${a.createdAt}-${a.action}-${i}`,
            when: listTime(a.createdAt),
            what: activityLabel(a.action),
            warning: isWarningActivity(a.action),
            device: a.device ?? '—',
            ip: a.ip ?? '—',
          })),
          hasMore: activity.hasMore,
          loadingMore: activity.loadingMore,
        },
      };
    },
    actions: {
      setCurrent(v) {
        current = v;
        if (pwErrors.current) pwErrors = { ...pwErrors, current: null };
        p.changed();
      },
      setNext(v) {
        next = v;
        if (pwErrors.next || pwErrors.repeat) pwErrors = { ...pwErrors, next: null, repeat: null };
        p.changed();
      },
      setRepeat(v) {
        repeat = v;
        if (pwErrors.repeat) pwErrors = { ...pwErrors, repeat: null };
        p.changed();
      },
      async changePassword() {
        if (pwBusy) return;
        pwErrors = checkPasswords();
        if (Object.values(pwErrors).some(Boolean)) {
          p.changed();
          return;
        }
        pwBusy = true;
        p.changed();
        try {
          await userApi.changePassword({ currentPassword: current, newPassword: next });
          current = '';
          next = '';
          repeat = '';
          // The account's own notification says so (a security toast from the header)
          loadDevices();
          activity.refresh();
        } catch (err) {
          const field = Object.keys(err?.details ?? {})[0];
          if (field === 'currentPassword') pwErrors = { current: err.message };
          else if (field === 'newPassword') pwErrors = { next: err.message };
          else errorToast('Your password wasn\'t changed', err);
        } finally {
          pwBusy = false;
          p.changed();
        }
      },

      async signOut(id) {
        if (revoking.has(id)) return;
        revoking.add(id);
        p.changed();
        try {
          await userApi.revokeSession(id);
          const gone = devices.list.find((d) => d.id === id);
          devices = { ...devices, list: devices.list.filter((d) => d.id !== id) };
          toast({ title: 'Signed out', body: gone ? `${gone.device} has to log in again.` : '', tone: 'success' });
          activity.refresh();
        } catch (err) {
          errorToast('That device wasn\'t signed out', err);
        } finally {
          revoking.delete(id);
          p.changed();
        }
      },
      async signOutOthers() {
        if (revokingAll) return;
        revokingAll = true;
        p.changed();
        try {
          const { revoked } = await userApi.revokeOtherSessions();
          devices = { ...devices, list: devices.list.filter((d) => d.current) };
          toast({ title: 'Signed out', body: `${revoked} other ${revoked === 1 ? 'device has' : 'devices have'} to log in again.`, tone: 'success' });
          activity.refresh();
        } catch (err) {
          errorToast('The other devices weren\'t signed out', err);
        } finally {
          revokingAll = false;
          p.changed();
        }
      },
      retryDevices() {
        devices = { status: 'loading', list: [] };
        p.changed();
        loadDevices();
      },
      loadMoreActivity: () => activity.loadMore(),
      retryActivity: () => activity.reset(),

      openTwoFactor() {
        const u = user();
        if (!u) return;
        dialog = u.twoFactorEnabled
          ? { mode: 'disable', code: '', codeError: null, password: '', passwordError: null, busy: false }
          : { mode: 'enable', code: '', codeError: null, setup: null, failed: false, busy: false };
        p.changed();
        if (dialog.mode === 'enable') startSetup();
      },
      closeTwoFactor() {
        dialog = null;
        p.changed();
      },
      retrySetup() {
        if (dialog?.mode !== 'enable') return;
        dialog = { ...dialog, failed: false };
        p.changed();
        startSetup();
      },
      setCode(v) {
        if (!dialog) return;
        dialog = { ...dialog, code: v, codeError: null };
        p.changed();
      },
      setDialogPassword(v) {
        if (!dialog) return;
        dialog = { ...dialog, password: v, passwordError: null };
        p.changed();
      },
      useDemoCode() {
        if (!dialog) return;
        dialog = { ...dialog, code: DEMO_CODE, codeError: null };
        p.changed();
      },
      async confirmTwoFactor() {
        if (!dialog || dialog.busy) return;
        const u = user();
        const errors = {};
        if (dialog.code.length !== 6) errors.codeError = 'Enter the six digits your app shows.';
        if (dialog.mode === 'disable' && u?.hasPassword && !dialog.password) errors.passwordError = 'Enter your password.';
        if (dialog.mode === 'enable' && !dialog.setup) return;
        if (Object.keys(errors).length) {
          dialog = { ...dialog, ...errors };
          p.changed();
          return;
        }
        dialog = { ...dialog, busy: true };
        p.changed();
        try {
          if (dialog.mode === 'enable') {
            await userApi.enableTwoFactor({ code: dialog.code });
          } else {
            await userApi.disableTwoFactor({ code: dialog.code, password: u?.hasPassword ? dialog.password : undefined });
          }
          // Its notification confirms the change
          dialog = null;
          await refreshUser();
          activity.refresh();
        } catch (err) {
          if (!dialog) return;
          const field = Object.keys(err?.details ?? {})[0];
          if (err?.code === 'INVALID_2FA_CODE') dialog = { ...dialog, busy: false, codeError: err.message };
          else if (field === 'password') dialog = { ...dialog, busy: false, passwordError: err.message };
          else {
            dialog = { ...dialog, busy: false };
            errorToast('Two-factor didn\'t change', err);
          }
        } finally {
          p.changed();
        }
      },
    },
    subscribe: p.subscribe,
    dispose: p.dispose,
  };
}
