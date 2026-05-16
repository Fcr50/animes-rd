// js/dashboard.js
import { supabase } from './supabase-client.js';
import { signInWithGoogle, onAuthStateChange, getCurrentUser } from './auth.js';

let currentUser = null;
let currentManagingGroupId = null;


async function init() {
  const dashboardContent = document.getElementById('dashboard-content');
  const authCheck = document.getElementById('auth-check');
  const authLoading = document.getElementById('auth-loading');
  const authLoginBox = document.getElementById('auth-login-box');
  const btnLoginDashboard = document.getElementById('btn-login-dashboard');

  if (!dashboardContent || !authCheck) return;

  const handleAuthState = async (user) => {
    currentUser = user;
    if (user) {
      dashboardContent.style.display = 'block';
      authCheck.style.display = 'none';
      await loadGroups();
    } else {
      dashboardContent.style.display = 'none';
      authCheck.style.display = 'block';
      if (authLoading) authLoading.style.display = 'none';
      if (authLoginBox) authLoginBox.style.display = 'block';
    }
  };

  if (btnLoginDashboard) btnLoginDashboard.onclick = signInWithGoogle;

  try {
    const user = await getCurrentUser();
    await handleAuthState(user);
  } catch (err) {
    if (authLoading) authLoading.style.display = 'none';
    if (authLoginBox) authLoginBox.style.display = 'block';
  }

  onAuthStateChange((event, sessionUser) => {
    handleAuthState(sessionUser);
  });

  document.getElementById('create-group-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await createGroup(document.getElementById('group-name').value);
  });

  document.getElementById('join-group-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await joinGroup(document.getElementById('invite-code').value);
  });

  document.getElementById('edit-group-form')?.addEventListener('submit', handleUpdateGroupName);
  document.getElementById('btn-delete-group')?.addEventListener('click', handleDeleteGroup);
}

const EMOJI_OPTIONS = ['🏠','👥','⭐','🎮','🎬','📺','🎵','🌟','🎯','🚀','🦊','🐉','🌸','🏆','💫','🌈','🐱','🎭','🦄','🍥','🎪','🔮','🐼','🌙'];

function groupIcon(name, gid) {
  if (gid) {
    const saved = localStorage.getItem(`group-icon-${gid}`);
    if (saved) return saved;
  }
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return EMOJI_OPTIONS[h % EMOJI_OPTIONS.length];
}

async function loadGroups() {
  const groupsList = document.getElementById('groups-list');
  if (!groupsList || !currentUser) return;
  groupsList.innerHTML = `
    <p class="skeleton" style="height:180px;border-radius:20px;"></p>
    <p class="skeleton" style="height:180px;border-radius:20px;"></p>
    <p class="skeleton" style="height:180px;border-radius:20px;"></p>`;

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, color, nickname, groups(id, name, creator_id, invite_code)')
      .eq('user_id', currentUser.id);

    const groupIds = (data || []).map(d => d.group_id);
    let membersMap = {};
    if (groupIds.length > 0) {
      const { data: allMembers } = await supabase
        .from('group_members')
        .select('group_id, nickname, color')
        .in('group_id', groupIds);
      (allMembers || []).forEach(m => {
        if (!membersMap[m.group_id]) membersMap[m.group_id] = [];
        membersMap[m.group_id].push(m);
      });
    }

    if (error) throw error;

    if (!data || data.length === 0) {
      groupsList.innerHTML = `
        <div style="color:var(--faint);grid-column:1/-1;text-align:center;padding:20px;border:1px dashed var(--border);border-radius:16px;">
          <p>Você ainda não participa de nenhum grupo.</p>
        </div>`;
      return;
    }

    groupsList.innerHTML = data.map(item => {
      const g = item.groups;
      if (!g) return '';
      const isCreator = g.creator_id === currentUser.id;
      const url = `acervo.html#g=${g.id}`;
      const memberColor = item.color || '#888888';
      const members = membersMap[g.id] || [];
      const shown = members.slice(0, 4);
      const extra = members.length - 4;

      const avatars = shown.map(m => `
        <div class="db-avatar" title="${m.nickname}" style="
          background:${m.color || '#888'}22;
          border:2px solid ${m.color || '#888'};
          color:${m.color || '#888'};
        ">${m.nickname[0].toUpperCase()}</div>`).join('');

      const extraBadge = extra > 0 ? `
        <div class="db-avatar" style="
          background:rgba(255,255,255,0.06);
          border:2px solid rgba(255,255,255,0.18);
          color:var(--muted);font-size:10px;
        ">+${extra}</div>` : '';

      const badge = isCreator
        ? `<span class="db-badge-creator">👑 Criador · <strong>${g.invite_code}</strong></span>`
        : `<span class="db-badge-member">Membro</span>`;

      const settingsBtn = isCreator
        ? `<button class="db-settings-btn" onclick="window.openManageModal('${g.id}','${g.name}')" title="Gerenciar">⚙️</button>`
        : '';

      return `
        <div class="db-group-card">
          <div class="db-group-top">
            <div class="db-group-icon" data-gid="${g.id}" style="background: rgba(107,90,224,0.22); box-shadow: inset 0 0 0 1px rgba(107,90,224,0.4);">${groupIcon(g.name, g.id)}</div>
            <div class="db-group-info">
              <div class="db-group-name">${g.name}</div>
              ${badge}
            </div>
            ${settingsBtn}
          </div>
          <div class="db-avatars">${avatars}${extraBadge}</div>
          <div class="db-card-footer">
            <div class="db-color-row">
              <button class="db-color-dot" data-color-gid="${g.id}" onclick="window.editMemberColor('${g.id}','${memberColor}',this)"
                style="background:${memberColor};" title="Editar minha cor no grupo"></button>
              <span class="db-color-label">Minha cor</span>
            </div>
            <a href="${url}" class="db-acervo-btn" style="background: rgba(107,90,224,0.15); border-color: rgba(107,90,224,0.55); color: #b098f8;">Abrir acervo →</a>
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    groupsList.innerHTML = `<p style="color:red">Erro ao carregar dados.</p>`;
  }
}

window.openManageModal = (gid, name) => {
  currentManagingGroupId = gid;
  const input = document.getElementById('edit-group-name');
  if (input) input.value = name;
  document.getElementById('modal-manage-group').classList.add('open');
  loadManageMembers(gid);
  loadEmojiPicker(gid, name);
};

function loadEmojiPicker(gid, groupName) {
  const picker = document.getElementById('emoji-picker');
  if (!picker) return;
  const current = groupIcon(groupName, gid);
  picker.innerHTML = EMOJI_OPTIONS.map(e => `
    <button type="button" class="db-emoji-btn ${e === current ? 'active' : ''}"
      onclick="window.setGroupIcon('${gid}', '${e}', this)">
      ${e}
    </button>`).join('');
}

window.setGroupIcon = (gid, emoji, btn) => {
  localStorage.setItem(`group-icon-${gid}`, emoji);
  document.querySelectorAll('.db-emoji-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Atualiza só o ícone no DOM, sem refetch
  document.querySelectorAll(`[data-gid="${gid}"]`).forEach(el => el.textContent = emoji);
};
window.closeManageModal = () => document.getElementById('modal-manage-group').classList.remove('open');

async function loadManageMembers(gid) {
  const { data } = await supabase.from('group_members').select('user_id, nickname, role').eq('group_id', gid);
  if (data) {
    // Admin sempre no topo
    data.sort((a, b) => (b.role === 'admin' ? 1 : (a.role === 'admin' ? -1 : 0)));

    document.getElementById('manage-members-list').innerHTML = data.map((m, idx) => {
      const isLast = idx === data.length - 1;
      const borderStyle = isLast ? '' : 'border-bottom: 1px solid var(--border);';
      
      return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 0; ${borderStyle}">
        <span style="font-weight: 600; color: var(--paper)">${m.role === 'admin' ? '👑 ' : ''}${m.nickname}</span>
        ${m.role !== 'admin' ? `<button onclick="window.removeMember('${m.user_id}')" style="color:var(--danger); background:none; border:none; cursor:pointer; font-size:12px; font-weight:700;">Remover</button>` : '<span style="font-size:10px; color:var(--faint); font-weight:800; text-transform:uppercase;">Admin</span>'}
      </div>`;
    }).join('');
  }
}

window.removeMember = async (uid) => {
  if (confirm('Deseja remover este membro do grupo?')) {
    const { error } = await supabase.from('group_members').delete().eq('group_id', currentManagingGroupId).eq('user_id', uid);
    if (!error) loadManageMembers(currentManagingGroupId);
  }
};

async function handleUpdateGroupName(e) {
  e.preventDefault();
  const name = document.getElementById('edit-group-name').value;
  await supabase.from('groups').update({ name }).eq('id', currentManagingGroupId);
  loadGroups(); closeManageModal();
}

async function handleDeleteGroup() {
  if (confirm('Excluir permanentemente?')) {
    await supabase.from('groups').delete().eq('id', currentManagingGroupId);
    loadGroups(); closeManageModal();
  }
}

async function createGroup(name) {
  const code = Math.random().toString(36).substring(2,8).toUpperCase();
  const { data } = await supabase.from('groups').insert([{ name, invite_code: code, creator_id: currentUser.id }]).select().single();
  if (data) window.location.href = `./join.html#code=${data.invite_code}`;
}

window.editMemberColor = (groupId, currentColor, btn) => {
  document.getElementById('color-popover')?.remove();

  const popover = document.createElement('div');
  popover.id = 'color-popover';
  popover.style.cssText = `
    position: fixed; z-index: 9999; padding: 12px; border-radius: 12px;
    background: #1c1c24; border: 1px solid rgba(255,255,255,0.15);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 12px;
  `;

  const rect = btn.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.min(rect.left, window.innerWidth - 200);
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  const presets = ['#7c3aed','#ec4899','#eab308','#06b6d4','#f97316','#10b981','#ef4444','#3b82f6','#a855f7','#f43f5e'];
  const swatches = presets.map(c => `
    <button onclick="window.applyMemberColor('${groupId}','${c}')"
      style="width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${c === currentColor ? '#fff' : 'transparent'};cursor:pointer;transition:transform .1s"
      onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
    </button>`).join('');

  popover.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;max-width:168px">${swatches}</div>
    <div style="display:flex;align-items:center;gap:10px;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;">
      <input id="color-custom-input" type="color" value="${currentColor}"
        style="width:30px;height:30px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;"
        onchange="window.applyMemberColor('${groupId}',this.value)" />
      <span style="font-size:12px;color:var(--faint);font-weight:600;">Cor personalizada</span>
    </div>
  `;

  document.body.appendChild(popover);

  // Evita que cliques no popover fechem ele mesmo
  popover.onclick = (e) => e.stopPropagation();

  setTimeout(() => {
    const handler = (e) => {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 0);
};

window.applyMemberColor = async (groupId, color) => {
  document.getElementById('color-popover')?.remove();
  const { error } = await supabase
    .from('group_members')
    .update({ color })
    .eq('group_id', groupId)
    .eq('user_id', currentUser.id);
  if (!error) {
    // Atualiza só a bolinha de cor no DOM, sem refetch
    const dot = document.querySelector(`[data-color-gid="${groupId}"]`);
    if (dot) { dot.style.background = color; dot.setAttribute('onclick', `window.editMemberColor('${groupId}','${color}',this)`); }
  }
};

async function joinGroup(code) {
  const cleanCode = code.trim().toUpperCase();
  const { data, error } = await supabase.from('groups').select('id').ilike('invite_code', cleanCode).single();
  if (error) alert('Código inválido ou não encontrado.');
  else if (data) window.location.href = `./join.html#code=${cleanCode}`;
}

init();
