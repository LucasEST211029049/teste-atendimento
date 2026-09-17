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

    frag.querySelector('.d-btn-ficha').addEventListener('click', () => abrirFichaModal(t.cpfCnpj));

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
      ${
        state.config.agenteIaConfigurado
          ? `<div class="ia-bloco">
               <button type="button" class="btn btn-secondary btn-consultar-ia">🤖 Consultar Agente de IA</button>
               <div class="ia-resultado" hidden></div>
             </div>`
          : ''
      }
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

    const btnIa = wrap.querySelector('.btn-consultar-ia');
    if (btnIa) {
      btnIa.addEventListener('click', async () => {
        const textoOriginal = btnIa.textContent;
        btnIa.disabled = true;
        btnIa.textContent = 'Consultando...';
        try {
          const { decisao } = await api(`/tickets/${t.protocolo}/analisar-ia`, { method: 'POST', body: {} });
          const resultado = wrap.querySelector('.ia-resultado');
          const decisaoTexto = decisao.Decisao || decisao.decisao || '';
          const justificativa = decisao.Justificativa || decisao.justificativa || '';
          resultado.hidden = false;
          resultado.innerHTML = `
            ${decisaoTexto ? `<div class="ia-decisao">Decisão do agente: <strong>${escapeHtml(decisaoTexto)}</strong></div>` : ''}
            <div class="ia-justificativa">${escapeHtml(justificativa || JSON.stringify(decisao))}</div>
          `;
          if (justificativa) wrap.querySelector('.acao-texto').value = justificativa;
          toast('Agente de IA consultado com sucesso.');
        } catch (err) {
          toast(err.message, 'erro');
        } finally {
          btnIa.disabled = false;
          btnIa.textContent = textoOriginal;
        }
      });
    }

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

  // ---------------------------------------------------- FICHA CADASTRAL ----
  function formatarDataISO(iso) {
    if (!iso) return '-';
    const [ano, mes, dia] = String(iso).slice(0, 10).split('-');
    return `${dia}/${mes}/${ano}`;
  }

  function formatarDataHoraISO(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${formatarDataISO(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatarMoeda(valor) {
    if (valor === null || valor === undefined) return '-';
    return Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Alterna as sub-abas "Risco Associado/LGC" / "Anotações Cadastrais" dentro
  // do .ficha-viewer mais próximo — o mesmo bloco de markup é reaproveitado
  // tanto no modal (aberto a partir de um atendimento) quanto na aba
  // "Risco / Restrições" (busca direta por CPF/CNPJ).
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.subtab-btn');
    if (!btn) return;
    const viewer = btn.closest('.ficha-viewer');
    viewer.querySelectorAll('.subtab-btn').forEach((b) => b.classList.remove('active'));
    viewer.querySelectorAll('.subtab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    viewer.querySelector(`[data-role="sub-${btn.dataset.subtab}"]`).classList.add('active');
  });

  async function abrirFichaModal(cpfCnpj) {
    el('modal-ficha').hidden = false;
    const viewer = el('modal-ficha').querySelector('.ficha-viewer');
    await carregarFicha(viewer, cpfCnpj);
  }

  async function carregarFicha(viewer, cpfCnpj) {
    const riscoCorpo = viewer.querySelector('[data-role="risco-corpo"]');
    const anotacoesCorpo = viewer.querySelector('[data-role="anotacoes-corpo"]');
    viewer.querySelector('[data-role="topo"]').innerHTML = 'Carregando...';
    riscoCorpo.innerHTML = 'Carregando...';
    anotacoesCorpo.innerHTML = 'Carregando...';
    try {
      const ficha = await api(`/associados/${encodeURIComponent(cpfCnpj)}`);
      const cpfCanonico = ficha.associado.cpfCnpj;
      renderFichaTopo(viewer, ficha.associado);
      renderFichaRisco(viewer, ficha);
      const anotacoes = await api(`/associados/${encodeURIComponent(cpfCanonico)}/anotacoes`);
      renderFichaAnotacoes(viewer, anotacoes, cpfCanonico);
      return true;
    } catch (err) {
      viewer.querySelector('[data-role="topo"]').innerHTML = '';
      riscoCorpo.innerHTML = `<p style="color:#c0392b;">${escapeHtml(err.message)}</p>`;
      anotacoesCorpo.innerHTML = '';
      return false;
    }
  }

  function renderFichaTopo(viewer, a) {
    viewer.querySelector('[data-role="topo"]').innerHTML = `
      <div class="ft-linha">
        <div class="ft-item"><span class="rotulo">CPF/CNPJ:</span>${a.cpfCnpj}</div>
        <div class="ft-item"><span class="rotulo">Nome:</span>${escapeHtml(a.nome)}</div>
        <div class="ft-item"><span class="rotulo">Conta Digital:</span>${a.contaDigital || '-'} (${a.contaStatus || '-'})</div>
      </div>
      <div class="ft-linha">
        <div class="ft-item"><span class="rotulo">Data de Nascimento:</span>${formatarDataISO(a.dataNascimento)}</div>
        <div class="ft-item"><span class="rotulo">Data de Associação:</span>${formatarDataISO(a.dataAssociacao)}</div>
        <div class="ft-item"><span class="rotulo">Segmento:</span>${a.segmento || '-'}</div>
      </div>
      <div class="ft-linha">
        <div class="ft-item"><span class="rotulo">Renda/Tipo de Renda:</span>${formatarMoeda(a.rendaMensal)} - ${a.rendaTipo || '-'} (${a.rendaStatus})</div>
        <div class="ft-item"><span class="rotulo">Validade da Renda:</span>${formatarDataISO(a.rendaValidade)}</div>
        <div class="ft-item"><span class="rotulo">Situação Cadastral:</span>${a.situacaoCadastral}</div>
      </div>
      <div class="ft-linha">
        <div class="ft-item"><span class="rotulo">Telefone Celular:</span>${a.telefone || '-'}</div>
        <div class="ft-item"><span class="rotulo">E-mail:</span>${a.email || '-'}</div>
        <div class="ft-item"><span class="rotulo">Bco/Ag/Conta Principal:</span>${a.banco || '-'} / ${a.agencia || '-'} / ${a.conta || '-'}</div>
      </div>
    `;
  }

  function situacaoRiscoClasse(status) {
    if (status === 'Vigente') return 'situacao-finalizado';
    if (status === 'Vencido') return 'situacao-pendente';
    return 'situacao-bloqueado';
  }

  function renderFichaRisco(viewer, ficha) {
    const { risco, categorias, lgc, temAnotacaoAtiva, associado } = ficha;

    const linhasCategoria = categorias.length
      ? categorias
          .map(
            (c) => `
        <tr class="${c.alerta ? 'alerta' : ''}">
          <td>${escapeHtml(c.categoria)}</td>
          <td class="num">${c.scoreAnterior ?? '-'}</td>
          <td class="num">${c.valorAnterior ?? '-'}</td>
          <td class="num">${c.scoreAtual ?? '-'}</td>
          <td class="num">${c.valorAtual ?? '-'}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" class="anotacao-vazia">Sem detalhamento por categoria.</td></tr>';

    viewer.querySelector('[data-role="risco-corpo"]').innerHTML = `
      <div class="ficha-acoes">
        <button class="btn btn-primary btn-analise-risco">Executar Nova Análise de Risco</button>
      </div>
      ${temAnotacaoAtiva ? '<p class="aviso-outra-area">⚠ Existe anotação interna ativa bloqueando o risco deste associado — veja a aba "Anotações Cadastrais".</p>' : ''}
      <table class="risco-tabela">
        <thead><tr><th>Risco do Associado</th><th>Anterior</th><th>Atual</th></tr></thead>
        <tbody>
          <tr><td>Risco</td><td>${risco.riscoAnterior || '-'}</td><td>${risco.riscoAtual}</td></tr>
          <tr><td>Status</td><td></td><td><span class="situacao-pill ${situacaoRiscoClasse(risco.status)}">${risco.status}</span></td></tr>
          <tr><td>Implantado em</td><td></td><td>${formatarDataISO(risco.implantadoEm)}</td></tr>
          <tr><td>Score</td><td>${risco.scoreAnterior ?? '-'}</td><td>${risco.scoreAtual}</td></tr>
        </tbody>
      </table>
      <table class="risco-tabela">
        <thead><tr><th>Categoria</th><th>Score Anterior</th><th>Valor Anterior</th><th>Score Atual</th><th>Valor Atual</th></tr></thead>
        <tbody>${linhasCategoria}</tbody>
      </table>
      <div class="ficha-grid">
        <div class="lgc-painel">
          <h4>LGC</h4>
          <div class="lgc-linha"><span>Situação do LGC</span><span class="valor">${risco.status}</span></div>
          <div class="lgc-linha"><span>Validade do LGC</span><span class="valor">${formatarDataISO(lgc.validade)}</span></div>
          <div class="lgc-linha"><span>Renda Mensal</span><span class="valor">${formatarMoeda(associado.rendaMensal)}</span></div>
          <div class="lgc-linha"><span>Multiplicador Segmento</span><span class="valor">${lgc.multiplicadorSegmento ?? '-'}</span></div>
          <div class="lgc-linha"><span>Risco Associado</span><span class="valor">${risco.riscoAtual}</span></div>
          <div class="lgc-linha"><span>Fator de Risco</span><span class="valor">${lgc.fatorRisco ?? '-'}</span></div>
          <div class="lgc-linha"><span>Fator de Endividamento</span><span class="valor">${lgc.fatorEndividamento ?? '-'}</span></div>
          <div class="lgc-linha"><span>Redutor Temporário</span><span class="valor">${lgc.redutorTemporario ?? '-'}</span></div>
          <div class="lgc-linha"><span>Limite Global</span><span class="valor">${formatarMoeda(lgc.limiteGlobal)}</span></div>
          <div class="lgc-linha"><span>Responsabilidades</span><span class="valor">- ${formatarMoeda(lgc.responsabilidades)}</span></div>
          <div class="lgc-linha"><span>Liberações Mês Corrente</span><span class="valor">- ${formatarMoeda(lgc.liberacoesMes)}</span></div>
          <div class="lgc-linha"><span>Amortizações Mês Corrente</span><span class="valor">+ ${formatarMoeda(lgc.amortizacoesMes)}</span></div>
          <div class="lgc-linha"><span><strong>Margem Operacional</strong></span><span class="valor"><strong>${formatarMoeda(lgc.margemOperacional)}</strong></span></div>
        </div>
        <div class="margem-painel">
          <h4>Margem de Descontos</h4>
          <div class="lgc-linha"><span>Percentual</span><span class="valor">${lgc.margemDescontoPercentual != null ? lgc.margemDescontoPercentual + '%' : '-'}</span></div>
          <div class="lgc-linha"><span>Máxima</span><span class="valor">${formatarMoeda(lgc.margemDescontoMaxima)}</span></div>
          <div class="lgc-linha"><span>Utilizada</span><span class="valor">${formatarMoeda(lgc.margemDescontoUtilizada)}</span></div>
          <div class="lgc-linha"><span><strong>Disponível</strong></span><span class="valor"><strong>${formatarMoeda(lgc.margemDescontoDisponivel)}</strong></span></div>
        </div>
      </div>
    `;

    viewer.querySelector('.btn-analise-risco').addEventListener('click', async () => {
      try {
        await api(`/associados/${encodeURIComponent(associado.cpfCnpj)}/analise-risco`, { method: 'POST' });
        toast('Nova análise de risco executada com sucesso.');
        await carregarFicha(viewer, associado.cpfCnpj);
      } catch (err) {
        toast(err.message, 'erro');
      }
    });
  }

  function renderFichaAnotacoes(viewer, dados, cpfCnpj) {
    const podeBaixar = (an) => state.user.areaId === an.areaCompetenteId;

    const cardAtiva = (an) => `
      <div class="anotacao-card bloqueia">
        <div class="an-titulo">${an.tipoCodigo} - ${escapeHtml(an.descricao)}</div>
        <div class="an-meta">Incluída em ${formatarDataHoraISO(an.dataInclusao)} por ${an.usuarioInclusao || '-'} · Competência para baixa: ${an.areaCompetenteNome}</div>
        <div class="an-acoes">
          ${
            podeBaixar(an)
              ? `<button class="btn btn-secondary btn-baixar" data-id="${an.id}">Baixar Anotação</button>`
              : `<span class="aviso-outra-area">Somente a área ${an.areaCompetenteNome} pode baixar esta anotação.</span>`
          }
        </div>
      </div>
    `;

    const cardBaixada = (an) => `
      <div class="anotacao-card">
        <div class="an-titulo">${an.tipoCodigo} - ${escapeHtml(an.descricao)}</div>
        <div class="an-meta">
          Incluída em ${formatarDataHoraISO(an.dataInclusao)} por ${an.usuarioInclusao || '-'}<br>
          Baixada em ${formatarDataHoraISO(an.dataBaixa)} por ${an.usuarioBaixa || '-'}${an.motivoBaixa ? ` — "${escapeHtml(an.motivoBaixa)}"` : ''}
        </div>
      </div>
    `;

    const anotacoesCorpo = viewer.querySelector('[data-role="anotacoes-corpo"]');
    anotacoesCorpo.innerHTML = `
      <h4 style="margin:6px 0;">Anotações Ativas</h4>
      ${dados.ativas.length ? dados.ativas.map(cardAtiva).join('') : '<p class="anotacao-vazia">Não há restrições cadastradas para o associado.</p>'}
      <h4 style="margin:18px 0 6px;">Anotações Baixadas</h4>
      ${dados.baixadas.length ? dados.baixadas.map(cardBaixada).join('') : '<p class="anotacao-vazia">Não há restrições baixadas para o associado.</p>'}
    `;

    anotacoesCorpo.querySelectorAll('.btn-baixar').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const motivo = prompt('Descreva o motivo da baixa desta anotação:');
        if (motivo === null) return;
        if (!motivo.trim()) return toast('Informe o motivo da baixa.', 'erro');
        try {
          await api(`/anotacoes/${btn.dataset.id}/baixar`, { method: 'POST', body: { motivo: motivo.trim() } });
          toast('Anotação baixada com sucesso.');
          await carregarFicha(viewer, cpfCnpj);
        } catch (err) {
          toast(err.message, 'erro');
        }
      });
    });
  }

  // -------------------------------------- ABA RISCO / RESTRIÇÕES (busca CPF)
  async function buscarRiscoPorCpf() {
    const cpf = el('risco-cpf-input').value.trim();
    if (!cpf) return toast('Digite um CPF/CNPJ para buscar.', 'erro');
    el('risco-aviso').hidden = true;
    el('risco-resultado').hidden = false;
    const viewer = document.querySelector('#risco-resultado .ficha-viewer');
    await carregarFicha(viewer, cpf);
  }

  el('btn-buscar-risco').addEventListener('click', buscarRiscoPorCpf);
  el('risco-cpf-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarRiscoPorCpf();
  });

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
