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

async function loadGroups() {
  const groupsList = document.getElementById('groups-list');
  if (!groupsList || !currentUser) return;
  groupsList.innerHTML = '<div class="skeleton" style="height: 100px;"></div>';

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, creator_id, invite_code)')
      .eq('user_id', currentUser.id);

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

      return `
        <div class="card group-card" style="position: relative; padding-bottom: 50px;">
          <a href="${url}" style="text-decoration: none; color: inherit; display: block;">
            <div class="card-title">${g.name}</div>
            <p style="font-size: 12px; color: var(--faint); margin-top: 8px;">
              ${isCreator ? `👑 Criador (Cód: <strong style="color: var(--accent)">${g.invite_code}</strong>)` : 'Membro'}
            </p>
          </a>
          <div style="position: absolute; bottom: 15px; left: 20px; right: 15px; display: flex; justify-content: space-between; align-items: center;">
             <a href="${url}" style="font-size: 11px; color: var(--accent); text-decoration: none;">Abrir acervo →</a>
             ${isCreator ? `<button class="btn-manage-trigger" onclick="window.openManageModal('${g.id}', '${g.name}')">⚙️</button>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    groupsList.innerHTML = `<p style="color:red">Erro ao carregar dados.</p>`;
  }
}

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
        ${m.role !== 'admin' ? `<button onclick="removeMember('${m.user_id}')" style="color:var(--danger); background:none; border:none; cursor:pointer;">Remover</button>` : '<span>Admin</span>'}
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

async function joinGroup(code) {
  const cleanCode = code.trim().toUpperCase();

  const { data, error } = await supabase
    .from('groups')
    .select('id')
    .ilike('invite_code', cleanCode)
    .single();

  if (error) {
    alert('Código inválido ou não encontrado.');
    return;
  }

  if (data) {
    window.location.href = `./join.html#code=${cleanCode}`;
  }
}

init();
