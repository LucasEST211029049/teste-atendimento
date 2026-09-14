(() => {
  const state = {
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    config: null,
    aberto: null, // protocolo atualmente expandido na tabela
  };

  const el = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- API ----
  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const erro = new Error(data.mensagem || 'Erro na requisição.');
      erro.status = res.status;
      throw erro;
    }
    return data;
  }

  function toast(msg, tipo = 'ok') {
    const div = document.createElement('div');
    div.className = `msg-toast ${tipo === 'ok' ? 'msg-ok' : 'msg-erro'}`;
    div.textContent = msg;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 3800);
  }

  // ------------------------------------------------------------- LOGIN -----
  async function carregarLoginsDemo() {
    try {
      const { usuarios } = await api('/usuarios-demo');
      const wrap = el('login-demo-list');
      wrap.innerHTML = '';
      usuarios.forEach((u) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = `${u.username} — ${u.nome} (${u.area})`;
        btn.addEventListener('click', () => {
          el('login-username').value = u.username;
          el('login-password').value = '123456';
        });
        wrap.appendChild(btn);
      });
    } catch (err) {
      // silencioso: apenas atalho de demonstração
    }
  }

  el('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('login-erro').hidden = true;
    try {
      const username = el('login-username').value.trim();
      const password = el('login-password').value;
      const { token, user } = await api('/login', { method: 'POST', body: { username, password } });
      state.token = token;
      state.user = user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      await iniciarApp();
    } catch (err) {
      el('login-erro').textContent = err.message;
      el('login-erro').hidden = false;
    }
  });

  el('btn-logout').addEventListener('click', async () => {
    try { await api('/logout', { method: 'POST' }); } catch (_) {}
    state.token = null;
    state.user = null;
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    location.reload();
  });

  // -------------------------------------------------------- INICIALIZAÇÃO --
  async function iniciarApp() {
    el('login-screen').hidden = true;
    el('app-screen').hidden = false;
    el('user-nome').textContent = state.user.nome;
    el('user-area').textContent = state.user.area;

    state.config = await api('/config');
    preencherSelects();
    await pesquisar();
    await atualizarFila();
  }

  function preencherSelects() {
    const { areas, assuntos, origens, situacoes } = state.config;

    const preencher = (select, itens, valorFn, textoFn, comTodos = true) => {
      select.innerHTML = '';
      if (comTodos) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = select.dataset.placeholder || 'Todos';
        select.appendChild(opt);
      }
      itens.forEach((item) => {
        const opt = document.createElement('option');
        opt.value = valorFn(item);
        opt.textContent = textoFn(item);
        select.appendChild(opt);
      });
    };

    el('f-area').dataset.placeholder = 'Todas';
    preencher(el('f-area'), areas, (a) => a.id, (a) => a.nome);
    preencher(el('f-assunto'), assuntos, (a) => a, (a) => a);
    preencher(el('f-situacao'), situacoes, (s) => s, (s) => s);
    preencher(el('f-origem'), origens, (o) => o, (o) => o);

    preencher(el('n-origem'), origens, (o) => o, (o) => o, false);
    preencher(el('n-assunto'), assuntos, (a) => a, (a) => a, false);
    preencher(el('n-area'), areas, (a) => a.id, (a) => a.nome, false);
  }

  // ------------------------------------------------------------- TABS ------
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      el(`tab-${btn.dataset.tab}`).classList.add('active');
      if (btn.dataset.tab === 'atender') atualizarFila();
    });
  });

  el('btn-toggle-filtros').addEventListener('click', () => {
    const grid = el('filtros');
    const escondido = grid.style.display === 'none';
    grid.style.display = escondido ? 'grid' : 'none';
    el('btn-toggle-filtros').textContent = escondido ? 'Todos os Filtros ▲' : 'Todos os Filtros ▼';
  });

  el('btn-limpar').addEventListener('click', () => {
    ['f-de', 'f-ate', 'f-protocolo', 'f-cpfcnpj', 'f-nome', 'f-responsavel'].forEach((id) => (el(id).value = ''));
    ['f-area', 'f-assunto', 'f-situacao', 'f-origem'].forEach((id) => (el(id).value = ''));
    pesquisar();
  });

  el('btn-pesquisar').addEventListener('click', () => pesquisar());

  // --------------------------------------------------------- PESQUISA ------
  function coletarFiltros() {
    const params = {
      de: el('f-de').value,
      ate: el('f-ate').value,
      protocolo: el('f-protocolo').value,
      cpfCnpj: el('f-cpfcnpj').value,
      nome: el('f-nome').value,
      areaId: el('f-area').value,
      assunto: el('f-assunto').value,
      situacao: el('f-situacao').value,
      origem: el('f-origem').value,
      responsavel: el('f-responsavel').value,
    };
    Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
    return params;
  }

  async function pesquisar() {
    const query = new URLSearchParams(coletarFiltros()).toString();
    const { tickets } = await api(`/tickets${query ? `?${query}` : ''}`);
    renderTabela(tickets);
  }

  function prazoBadgeClasse(dias) {
    if (dias <= 1) return 'prazo-ok';
    if (dias <= 3) return 'prazo-atencao';
    return 'prazo-atraso';
  }

  function situacaoClasse(situacao) {
    if (situacao === 'Pendente') return 'situacao-pendente';
    if (situacao === 'Em Atendimento') return 'situacao-andamento';
    return 'situacao-finalizado';
  }

  function renderTabela(tickets) {
    const tplLinha = el('tpl-linha');
    const body = el('tabela-body');
    body.innerHTML = '';
    el('tabela-vazio').hidden = tickets.length > 0;

    tickets.forEach((t) => {
      const frag = tplLinha.content.cloneNode(true);
      const linha = frag.querySelector('.linha-ticket');
      const linhaDetalhe = frag.querySelector('.linha-detalhe');

      linha.querySelector('.col-protocolo').textContent = t.protocolo;
      linha.querySelector('.col-solicitacao').textContent = t.dataSolicitacao;
      linha.querySelector('.col-tipo').textContent = t.tipoRegistro;
      linha.querySelector('.col-cpf').textContent = t.cpfCnpj;
      linha.querySelector('.col-nome').textContent = t.nome;
      linha.querySelector('.col-origem').textContent = t.origem;
      linha.querySelector('.col-assunto').textContent = t.assunto;
      linha.querySelector('.col-area').textContent = t.areaNome;
      linha.querySelector('.col-responsavel').textContent = t.responsavelAtual || '';

      const situacaoEl = document.createElement('span');
      situacaoEl.className = `situacao-pill ${situacaoClasse(t.situacao)}`;
      situacaoEl.textContent = t.situacao;
      linha.querySelector('.col-situacao').appendChild(situacaoEl);

      const badge = linha.querySelector('.prazo-badge');
      badge.textContent = `${t.prazoDias}d`;
      badge.classList.add(prazoBadgeClasse(t.prazoDias));

      linha.dataset.protocolo = t.protocolo;
      linha.addEventListener('click', () => toggleDetalhe(t.protocolo, linha, linhaDetalhe));

      body.appendChild(frag);
    });
  }

  async function toggleDetalhe(protocolo, linha, linhaDetalhe) {
    // fecha detalhe já aberto de outra linha
    document.querySelectorAll('.linha-ticket.aberta').forEach((l) => {
      if (l !== linha) {
        l.classList.remove('aberta');
        l.nextElementSibling.hidden = true;
        l.nextElementSibling.querySelector('td').innerHTML = '';
      }
    });

    const estaAberta = linha.classList.contains('aberta');
    if (estaAberta) {
      linha.classList.remove('aberta');
      linhaDetalhe.hidden = true;
      linhaDetalhe.querySelector('td').innerHTML = '';
      return;
    }

    linha.classList.add('aberta');
    linhaDetalhe.hidden = false;
    const td = linhaDetalhe.querySelector('td');
    td.innerHTML = '<div style="padding:14px 20px;color:#888;">Carregando...</div>';

    try {
      const { ticket } = await api(`/tickets/${protocolo}`);
      renderDetalhe(td, ticket);
    } catch (err) {
      td.innerHTML = `<div style="padding:14px 20px;color:#c0392b;">${err.message}</div>`;
    }
  }

  function renderDetalhe(container, t) {
    const tpl = el('tpl-detalhe');
    const frag = tpl.content.cloneNode(true);

    frag.querySelector('.d-protocolo').textContent = t.protocolo;
    const abertura = t.historico[0];
    frag.querySelector('.d-data').textContent = abertura.data;
    frag.querySelector('.d-hora').textContent = abertura.hora;
    frag.querySelector('.d-abertura-resp').textContent = abertura.responsavel;
    frag.querySelector('.d-assunto').textContent = t.assunto;
    frag.querySelector('.d-ocorrencia-texto').textContent = t.ocorrencia;

    const historicoWrap = frag.querySelector('.d-historico-lista');
    t.historico.forEach((h) => {
      const item = document.createElement('div');
      item.className = 'historico-item';
      item.innerHTML = `
        <div class="h-top">
          <span>Data: <strong>${h.data}</strong></span>
          <span>Hora: <strong>${h.hora}</strong></span>
          <span>Responsável: <strong>${h.responsavel}</strong></span>
        </div>
        ${h.texto ? `<div class="h-texto">${escapeHtml(h.texto)}</div>` : ''}
        ${h.detalhe ? `<div class="h-detalhe">${escapeHtml(h.detalhe)}</div>` : ''}
      `;
      historicoWrap.appendChild(item);
    });

    const acaoArea = frag.querySelector('.d-acao-area');
    montarAcaoArea(acaoArea, t);

    container.innerHTML = '';
    container.appendChild(frag);
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function montarAcaoArea(container, t) {
    const minhaArea = state.user.areaId;
    const souResponsavel = t.responsavelUsername === state.user.username;

    if (t.situacao === 'Finalizado') {
      container.innerHTML = '<span class="aviso-outra-area">Atendimento finalizado.</span>';
      return;
    }

    if (t.situacao === 'Pendente') {
      if (t.areaId !== minhaArea) {
        container.innerHTML = '<span class="aviso-outra-area">Este atendimento pertence a outra área. Você pode visualizar, mas não atender.</span>';
        return;
      }
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.textContent = 'Atender';
      btn.addEventListener('click', async () => {
        try {
          await api(`/tickets/${t.protocolo}/atender`, { method: 'POST' });
          toast('Atendimento assumido com sucesso.');
          await pesquisar();
          await atualizarFila();
          // a tabela foi reconstruída pela pesquisa: reabre a linha já com o estado atualizado
          document.querySelector(`.linha-ticket[data-protocolo="${t.protocolo}"]`)?.click();
        } catch (err) {
          toast(err.message, 'erro');
          await pesquisar();
        }
      });
      container.appendChild(btn);
      return;
    }

    // Em Atendimento
    if (!souResponsavel) {
      container.innerHTML = `<span class="aviso-outra-area">Em atendimento por ${t.responsavelAtual}.</span>`;
      return;
    }

    container.appendChild(montarFormularioAcao(t));
  }

  function montarFormularioAcao(t) {
    const wrap = document.createElement('div');
    wrap.className = 'acao-form';

    const areas = state.config.areas;
    const optionsAreas = areas.map((a) => `<option value="${a.id}">${a.nome}${a.id === t.areaId ? ' (área atual)' : ''}</option>`).join('');

    wrap.innerHTML = `
      <div class="campo">
        <label>Resposta / O que foi feito</label>
        <textarea rows="3" class="acao-texto" placeholder="Descreva o atendimento realizado..."></textarea>
      </div>
      <div class="campo">
        <label>Encaminhar para Área (ao encaminhar)</label>
        <select class="acao-area">${optionsAreas}</select>
      </div>
      <div class="acao-botoes">
        <button type="button" class="btn btn-secondary acao-encaminhar">Encaminhar</button>
        <button type="button" class="btn btn-primary acao-finalizar">Finalizar Atendimento</button>
      </div>
    `;

    wrap.querySelector('.acao-encaminhar').addEventListener('click', async () => {
      const texto = wrap.querySelector('.acao-texto').value.trim();
      const areaDestinoId = wrap.querySelector('.acao-area').value;
      if (!texto) return toast('Descreva o que foi feito antes de encaminhar.', 'erro');
      try {
        await api(`/tickets/${t.protocolo}/encaminhar`, { method: 'POST', body: { texto, areaDestinoId } });
        toast('Atendimento encaminhado com sucesso.');
        await pesquisar();
        await atualizarFila();
        fecharTodosDetalhes();
      } catch (err) {
        toast(err.message, 'erro');
      }
    });

    wrap.querySelector('.acao-finalizar').addEventListener('click', async () => {
      const texto = wrap.querySelector('.acao-texto').value.trim();
      if (!texto) return toast('Descreva o que foi feito antes de finalizar.', 'erro');
      try {
        await api(`/tickets/${t.protocolo}/finalizar`, { method: 'POST', body: { texto } });
        toast('Atendimento finalizado com sucesso.');
        await pesquisar();
        await atualizarFila();
        fecharTodosDetalhes();
      } catch (err) {
        toast(err.message, 'erro');
      }
    });

    return wrap;
  }

  function fecharTodosDetalhes() {
    document.querySelectorAll('.linha-ticket.aberta').forEach((l) => {
      l.classList.remove('aberta');
      l.nextElementSibling.hidden = true;
      l.nextElementSibling.querySelector('td').innerHTML = '';
    });
  }

  // -------------------------------------------------------- MINHA FILA -----
  async function atualizarFila() {
    const { tickets } = await api('/tickets/minha-fila');
    const badge = el('badge-fila');
    if (tickets.length > 0) {
      badge.hidden = false;
      badge.textContent = tickets.length;
    } else {
      badge.hidden = true;
    }

    const lista = el('fila-lista');
    lista.innerHTML = '';
    el('fila-vazia').hidden = tickets.length > 0;

    tickets.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'fila-card';
      card.innerHTML = `
        <div class="fila-card-header">
          <span>Protocolo ${t.protocolo} — ${t.nome} (${t.assunto})</span>
          <span class="situacao-pill ${situacaoClasse(t.situacao)}">${t.situacao}</span>
        </div>
        <div class="fila-card-body"></div>
      `;
      const body = card.querySelector('.fila-card-body');
      renderDetalhe(body, t);
      lista.appendChild(card);
    });
  }

  // ------------------------------------------------------ NOVA OCORRÊNCIA --
  el('btn-nova-ocorrencia').addEventListener('click', () => { el('modal-nova').hidden = false; });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => { el(btn.dataset.close).hidden = true; });
  });

  el('form-nova').addEventListener('submit', async (e) => {
    e.preventDefault();
    el('nova-erro').hidden = true;
    try {
      await api('/tickets', {
        method: 'POST',
        body: {
          cpfCnpj: el('n-cpfcnpj').value.trim(),
          nome: el('n-nome').value.trim(),
          origem: el('n-origem').value,
          assunto: el('n-assunto').value,
          areaId: el('n-area').value,
          ocorrencia: el('n-ocorrencia').value.trim(),
        },
      });
      toast('Ocorrência registrada com sucesso.');
      el('modal-nova').hidden = true;
      el('form-nova').reset();
      await pesquisar();
    } catch (err) {
      el('nova-erro').textContent = err.message;
      el('nova-erro').hidden = false;
    }
  });

  // ------------------------------------------------------------- BOOT ------
  carregarLoginsDemo();
  if (state.token && state.user) {
    iniciarApp().catch(() => {
      localStorage.clear();
      location.reload();
    });
  }
})();
