// js/dashboard.js
import { supabase } from './supabase-client.js';
import { signInWithGoogle, onAuthStateChange, getCurrentUser } from './auth.js';

let currentUser = null;
let currentManagingGroupId = null;

async function init() {
  console.log('Dashboard: Inicializando...');
  
  const dashboardContent = document.getElementById('dashboard-content');
  const authCheck = document.getElementById('auth-check');
  const authLoading = document.getElementById('auth-loading');
  const authLoginBox = document.getElementById('auth-login-box');
  const btnLoginDashboard = document.getElementById('btn-login-dashboard');

  if (!dashboardContent || !authCheck) return;

  const handleAuthState = async (user) => {
    currentUser = user;
    if (user) {
      console.log('Dashboard: Usuário logado:', user.email);
      dashboardContent.style.display = 'block';
      authCheck.style.display = 'none';
      await loadGroups();
    } else {
      console.log('Dashboard: Nenhum usuário.');
      dashboardContent.style.display = 'none';
      authCheck.style.display = 'block';
      if (authLoading) authLoading.style.display = 'none';
      if (authLoginBox) authLoginBox.style.display = 'block';
    }
  };

  // Atribui login antes de tudo
  if (btnLoginDashboard) btnLoginDashboard.onclick = signInWithGoogle;

  // 1. Tenta pegar usuário inicial
  try {
    const user = await getCurrentUser();
    await handleAuthState(user);
  } catch (err) {
    console.error('Erro na inicialização:', err);
    if (authLoading) authLoading.style.display = 'none';
    if (authLoginBox) authLoginBox.style.display = 'block';
  }

  // 2. Escuta mudanças
  onAuthStateChange((event, sessionUser) => {
    handleAuthState(sessionUser);
  });

  // Eventos de Formulário
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

async function loadGroups() {
  const groupsList = document.getElementById('groups-list');
  if (!groupsList || !currentUser) return;
  groupsList.innerHTML = '<div class="skeleton" style="height: 100px;"></div>';

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, color, nickname, groups(id, name, creator_id, invite_code)')
      .eq('user_id', currentUser.id);

    // Busca membros de cada grupo
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
        <div style="color: var(--faint); grid-column: 1/-1; text-align: center; padding: 20px; border: 1px dashed var(--border); border-radius: 8px;">
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

      const memberAvatars = shown.map(m => `
        <div title="${m.nickname}" style="
          width: 32px; height: 32px; border-radius: 50%;
          background: ${m.color || '#888'}22;
          border: 2px solid ${m.color || '#888'};
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; color: ${m.color || '#888'};
          flex-shrink: 0;
        ">${m.nickname[0].toUpperCase()}</div>
      `).join('');

      const extraBadge = extra > 0 ? `
        <div style="
          width: 32px; height: 32px; border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 2px solid rgba(255,255,255,0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 800; color: var(--muted);
        ">+${extra}</div>` : '';

      return `
        <div class="card group-card" style="display:flex; flex-direction:column; gap:0; padding: 22px;">

          <!-- Nome -->
          <div style="
            font-family: 'Newsreader', serif;
            font-size: 28px; font-weight: 750;
            letter-spacing: -0.02em; line-height: 1.1;
            background: linear-gradient(90deg, #5d8bff, #57cdae);
            -webkit-background-clip: text; -webkit-text-fill-color: transparent;
            background-clip: text; margin-bottom: 4px;
          ">${g.name}</div>

          <!-- Role -->
          <p style="font-size: 11px; color: var(--faint); margin: 0 0 16px 0;">
            ${isCreator ? `👑 Criador · <span style="color:var(--accent)">${g.invite_code}</span>` : 'Membro'}
          </p>

          <!-- Membros -->
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom: 16px;">
            ${memberAvatars}${extraBadge}
          </div>

          <!-- Divisor -->
          <div style="border-top: 1px solid var(--border); margin-bottom: 14px;"></div>

          <!-- Minha cor + Abrir -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <button
                onclick="window.editMemberColor('${g.id}', '${memberColor}', this)"
                style="width:20px; height:20px; border-radius:50%; background:${memberColor}; border:2px solid rgba(255,255,255,0.25); cursor:pointer; flex-shrink:0;"
                title="Editar minha cor no grupo"
              ></button>
              <span style="font-size:11px; color:var(--faint);">Minha cor</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <a href="${url}" style="font-size:12px; font-weight:700; color:var(--accent); text-decoration:none;">Abrir acervo →</a>
              ${isCreator ? `<button class="btn-manage-trigger" onclick="window.openManageModal('${g.id}', '${g.name}')">⚙️</button>` : ''}
            </div>
          </div>

        </div>`;
    }).join('');
  } catch (err) {
    groupsList.innerHTML = `<p style="color:red">Erro: ${err.message}</p>`;
  }
}

// Modais e Gestão
window.openManageModal = (gid, name) => {
  currentManagingGroupId = gid;
  document.getElementById('edit-group-name').value = name;
  document.getElementById('modal-manage-group').classList.add('open');
  loadManageMembers(gid);
};
window.closeManageModal = () => document.getElementById('modal-manage-group').classList.remove('open');

async function loadManageMembers(gid) {
  const { data } = await supabase.from('group_members').select('user_id, nickname, role').eq('group_id', gid);
  if (data) {
    document.getElementById('manage-members-list').innerHTML = data.map(m => `
      <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border);">
        <span>${m.nickname}</span>
        ${m.role !== 'admin' ? `<button onclick="removeMember('${m.user_id}')" style="color:var(--danger); background:none; border:none;">Remover</button>` : '<span>Admin</span>'}
      </div>`).join('');
  }
}

window.removeMember = async (uid) => {
  if (confirm('Remover?')) {
    await supabase.from('group_members').delete().eq('group_id', currentManagingGroupId).eq('user_id', uid);
    loadManageMembers(currentManagingGroupId);
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
  // Remove popover anterior se existir
  document.getElementById('color-popover')?.remove();

  const popover = document.createElement('div');
  popover.id = 'color-popover';
  popover.style.cssText = `
    position: fixed; z-index: 9999; padding: 12px; border-radius: 12px;
    background: var(--card, #1a1825); border: 1px solid var(--border, rgba(255,255,255,0.15));
    box-shadow: 0 8px 32px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 10px;
  `;

  // Posiciona próximo à bolinha
  const rect = btn.getBoundingClientRect();
  const top = rect.bottom + 8;
  const left = Math.min(rect.left, window.innerWidth - 200);
  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  // Cores predefinidas
  const presets = ['#7c3aed','#ec4899','#eab308','#06b6d4','#f97316','#10b981','#ef4444','#3b82f6','#a855f7','#f43f5e'];
  const swatches = presets.map(c => `
    <button onclick="window.applyMemberColor('${groupId}','${c}')"
      style="width:24px;height:24px;border-radius:50%;background:${c};border:2px solid ${c === currentColor ? '#fff' : 'transparent'};cursor:pointer;transition:transform .1s"
      onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform='scale(1)'">
    </button>`).join('');

  popover.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:6px;max-width:168px">${swatches}</div>
    <div style="display:flex;align-items:center;gap:8px;">
      <input id="color-custom-input" type="color" value="${currentColor}"
        style="width:32px;height:32px;border:none;background:none;cursor:pointer;padding:0;border-radius:6px;"
        oninput="window.applyMemberColor('${groupId}',this.value)" />
      <span style="font-size:11px;color:var(--muted);">Cor personalizada</span>
    </div>
  `;

  document.body.appendChild(popover);

  // Fecha ao clicar fora
  setTimeout(() => {
    document.addEventListener('click', function handler(e) {
      if (!popover.contains(e.target) && e.target !== btn) {
        popover.remove();
        document.removeEventListener('click', handler);
      }
    });
  }, 0);
};

window.applyMemberColor = async (groupId, color) => {
  document.getElementById('color-popover')?.remove();
  const { error } = await supabase
    .from('group_members')
    .update({ color })
    .eq('group_id', groupId)
    .eq('user_id', currentUser.id);
  if (!error) loadGroups();
  else alert('Erro ao salvar cor.');
};

async function joinGroup(code) {
  const cleanCode = code.trim().toUpperCase();
  console.log('Buscando grupo com código:', cleanCode);

  const { data, error } = await supabase
    .from('groups')
    .select('id')
    .ilike('invite_code', cleanCode)
    .single();

  if (error) {
    console.error('Erro na busca do grupo:', error);
    alert('Código inválido ou não encontrado.');
    return;
  }

  if (data) {
    window.location.href = `./join.html#code=${cleanCode}`;
  }
}

init();
