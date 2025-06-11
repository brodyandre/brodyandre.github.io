// Carregar projetos dinamicamente do GitHub e seus READMEs
document.addEventListener('DOMContentLoaded', function() {
  const username = 'brodyandre';

  // OPTIONAL: Add your GitHub Personal Access Token here to increase API rate limits.
  // Leave as empty string "" if no token.
  const githubToken = '';

  // Helper to build headers with optional token
  function getGitHubHeaders() {
    const headers = { Accept: 'application/vnd.github.v3+json' };
    if (githubToken) headers.Authorization = `token ${githubToken}`;
    return headers;
  }

  const filtroBtns = document.querySelectorAll('.filtro button');
  const listaProjetos = document.getElementById('lista-projetos');

  // Extract first meaningful paragraph or fallback text
  function extractDescription(readmeContent) {
    if (!readmeContent) return 'Descrição não disponível.';
    const paragraphs = readmeContent.split(/\r?\n\r?\n/);
    for (let p of paragraphs) {
      let text = p.trim();
      if (text.length > 0) {
        text = text.replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
                   .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Simplify links text
                   .replace(/[>#*_`~\-]/g, '') // Remove markdown chars
                   .trim();
        if (text.length > 20) return text;
      }
    }
    return 'Descrição não disponível.';
  }

  // Fetch README raw content
  async function fetchREADME(repoName) {
    const url = `https://api.github.com/repos/${username}/${repoName}/readme`;
    try {
      const res = await fetch(url, { headers: getGitHubHeaders() });
      if (!res.ok) return null;
      const data = await res.json();
      if (data && data.content && data.encoding === 'base64') {
        // Decode base64 README content
        return atob(data.content.replace(/\n/g, ''));
      } else if (res.headers.get('content-type').includes('text/plain')) {
        // Fallback: if raw text response
        return await res.text();
      }
      return null;
    } catch {
      return null;
    }
  }

  // Fetch all repos (max 500 repos via pagination)
  async function fetchAllRepos() {
    let repos = [];
    let page = 1;
    const per_page = 100;
    while (true) {
      const url = `https://api.github.com/users/${username}/repos?per_page=${per_page}&page=${page}&sort=updated`;
      try {
        const res = await fetch(url, { headers: getGitHubHeaders() });
        if (!res.ok) {
          if (res.status === 403) {
            throw new Error('Limite de requisições da API GitHub atingido. Considere adicionar um token válido.');
          } else {
            throw new Error(`Erro HTTP ${res.status} ao buscar os repositórios do GitHub.`);
          }
        }
        const pageRepos = await res.json();
        repos.push(...pageRepos);
        if (pageRepos.length < per_page || page >= 5) break;
        page++;
      } catch (error) {
        throw error;
      }
    }
    return repos;
  }

  // Check if repo matches language filter
  function repoMatchesFilter(repo, filterLanguage) {
    if (filterLanguage === 'all') return true;
    const langLower = (repo.language || '').toLowerCase();

    if (filterLanguage === 'python') return langLower === 'python';
    if (filterLanguage === 'spark') return langLower === 'scala' || (repo.name && repo.name.toLowerCase().includes('spark'));
    if (filterLanguage === 'aws') return (repo.name && repo.name.toLowerCase().includes('aws')) ||
                                         (repo.description && repo.description.toLowerCase().includes('aws'));
    return false;
  }

  // Render filtered projects
  function renderProjetos(projetos, filter = 'all') {
    listaProjetos.innerHTML = '';

    const filtered = filter === 'all' ? projetos : projetos.filter(p => repoMatchesFilter(p, filter));

    if (filtered.length === 0) {
      listaProjetos.innerHTML = '<p>Nenhum projeto encontrado para o filtro selecionado.</p>';
      return;
    }

    filtered.forEach(projeto => {
      const div = document.createElement('div');
      div.className = 'projeto-card';
      div.innerHTML = `
        <h3>${projeto.title}</h3>
        <p>${projeto.description}</p>
        <div class="projeto-linguagens">
          ${projeto.languages.map(lang => `<span class="linguagem-tag ${lang}">${lang}</span>`).join('')}
        </div>
        <a href="${projeto.link}" class="projeto-link" target="_blank" rel="noopener noreferrer">Ver detalhes</a>
      `;
      listaProjetos.appendChild(div);
    });
  }

  // Load projects asynchronously
  async function loadProjects() {
    listaProjetos.innerHTML = '<p>Carregando projetos do GitHub...</p>';
    try {
      const allRepos = await fetchAllRepos();

      const reposToLoad = allRepos.slice(0, 55);

      const concurrencyLimit = 5;
      let index = 0;
      const projects = [];

      async function fetchBatch() {
        const batch = reposToLoad.slice(index, index + concurrencyLimit);
        const promises = batch.map(async repo => {
          const readmeRaw = await fetchREADME(repo.name);
          const desc = extractDescription(readmeRaw);
          const languages = [];

          if (repo.language) languages.push(repo.language.toLowerCase());
          if ((repo.name && repo.name.toLowerCase().includes('aws')) || (repo.description && repo.description.toLowerCase().includes('aws'))) {
            if (!languages.includes('aws')) languages.push('aws');
          }
          if ((repo.name && repo.name.toLowerCase().includes('spark')) || (repo.language && repo.language.toLowerCase() === 'scala')) {
            if (!languages.includes('spark')) languages.push('spark');
          }
          if (repo.language && repo.language.toLowerCase() === 'python') {
            if (!languages.includes('python')) languages.push('python');
          }

          return {
            title: repo.name,
            description: desc,
            languages,
            link: repo.html_url
          };
        });
        const results = await Promise.all(promises);
        projects.push(...results);
        index += concurrencyLimit;
      }

      while (index < reposToLoad.length) {
        await fetchBatch();
        await new Promise(res => setTimeout(res, 150));
      }

      renderProjetos(projects);

      // Aria update logic and event listener for filters
      filtroBtns.forEach(btn => {
        btn.addEventListener('click', function() {
          filtroBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-checked', 'false');
          });
          this.classList.add('active');
          this.setAttribute('aria-checked', 'true');
          renderProjetos(projects, this.dataset.language);
        });

        // Add keyboard support for radio buttons (Space and Enter)
        btn.addEventListener('keydown', e => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault();
            btn.click();
          }
        });
      });
    } catch (error) {
      listaProjetos.innerHTML = `<p style="color: red;">Erro ao carregar projetos: ${error.message}</p>`;
      console.error(error);
    }
  }

  loadProjects();

  // Modal para certificados
  const modal = document.getElementById('certificado-modal');
  const modalImg = document.getElementById('imagem-certificado');
  const closeModal = modal ? modal.querySelector('.fechar-modal') : null;

  if (closeModal) {
    closeModal.addEventListener('click', () => {
      modal.style.display = "none";
    });
    closeModal.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        modal.style.display = "none";
      }
    });
  }

  document.querySelectorAll('.ver-credencial').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.style.display = "block";
      modalImg.src = btn.dataset.imagem;
      modal.focus();
    });
  });

  // Modal do mapa
  const mapaModal = document.getElementById('mapa-modal');
  const abrirMapa = document.getElementById('abrir-mapa');
  const fecharMapa = mapaModal ? mapaModal.querySelector('.fechar-modal') : null;

  if (abrirMapa && mapaModal) {
    abrirMapa.addEventListener('click', () => {
      mapaModal.style.display = "block";
      mapaModal.focus();
    });
  }

  if (fecharMapa) {
    fecharMapa.addEventListener('click', () => {
      mapaModal.style.display = "none";
    });
    fecharMapa.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        mapaModal.style.display = "none";
      }
    });
  }

  // Fechar modais ao clicar fora e ao apertar ESC
  window.addEventListener('click', e => {
    if (e.target === modal) modal.style.display = "none";
    if (e.target === mapaModal) mapaModal.style.display = "none";
    if (window.curriculoModal && e.target === window.curriculoModal) window.curriculoModal.style.display = "none";
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (modal.style.display === "block") modal.style.display = "none";
      if (mapaModal.style.display === "block") mapaModal.style.display = "none";
      if (window.curriculoModal && window.curriculoModal.style.display === "block") window.curriculoModal.style.display = "none";
    }
  });

  // Botão voltar ao topo
  const backToTopBtn = document.getElementById('back-to-top');
  window.addEventListener('scroll', () => {
    backToTopBtn.style.display = window.pageYOffset > 300 ? "block" : "none";
  });

  backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Toggle de tema claro/escuro
  const themeToggle = document.getElementById('theme-toggle');
  themeToggle.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('darkTheme', isDark);
    themeToggle.textContent = isDark ? '🌞' : '🌓';
    themeToggle.setAttribute('aria-pressed', isDark.toString());
  });

  if (localStorage.getItem('darkTheme') === 'true') {
    document.body.classList.add('dark-theme');
    themeToggle.textContent = '🌞';
    themeToggle.setAttribute('aria-pressed', 'true');
  } else {
    themeToggle.setAttribute('aria-pressed', 'false');
  }

  // Scroll suave para links internos
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const targetId = anchor.getAttribute('href');
      const target = document.querySelector(targetId);
      if (target) target.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Formulário de contato
  const formContato = document.getElementById('form-contato');
  if (formContato) {
    formContato.addEventListener('submit', e => {
      e.preventDefault();
      alert('Mensagem enviada com sucesso! Entrarei em contato em breve.');
      formContato.reset();
    });
  }

  // Modal do currículo
  const curriculoModal = document.createElement('div');
  curriculoModal.className = 'modal';
  curriculoModal.setAttribute('role', 'dialog');
  curriculoModal.setAttribute('aria-modal', 'true');
  curriculoModal.setAttribute('tabindex', '-1');
  curriculoModal.innerHTML = `
    <span class="fechar-modal" role="button" aria-label="Fechar modal" tabindex="0">&times;</span>
    <img class="modal-conteudo" id="imagem-curriculo" alt="Currículo" src="https://raw.githubusercontent.com/brodyandre/brodyandre.github.io/2dd5745396c2935c5db7e8365ceb8e2b0463b100/Curriculo%20moderno%20para%20profissional%20de%20TI%20azul.jpg" />
  `;
  document.body.appendChild(curriculoModal);
  window.curriculoModal = curriculoModal;

  const verCurriculoBtn = document.getElementById('ver-curriculo');
  verCurriculoBtn.addEventListener('click', () => {
    curriculoModal.style.display = "block";
    curriculoModal.focus();
  });

  const fecharCurriculoModal = curriculoModal.querySelector('.fechar-modal');
  fecharCurriculoModal.addEventListener('click', () => {
    curriculoModal.style.display = "none";
  });
  fecharCurriculoModal.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      curriculoModal.style.display = "none";
    }
  });
});


// Atualização do modal do mapa com localização dinâmica
const mapaModal = document.getElementById('mapa-modal');
const abrirMapa = document.getElementById('abrir-mapa');
const fecharMapa = mapaModal ? mapaModal.querySelector('.fechar-modal') : null;
const iframeMapa = document.getElementById('iframe-mapa');

if (abrirMapa && mapaModal && iframeMapa) {
  abrirMapa.addEventListener('click', () => {
    iframeMapa.src = 'https://maps.google.com/maps?width=600&height=450&hl=pt-BR&q=Rua+Tom%C3%A9+Ribeiro,+49,+Jardim+Sapopemba,+São+Paulo+SP&ie=UTF8&t=&z=16&iwloc=B&output=embed';
    mapaModal.style.display = "block";
    mapaModal.focus();
  });
}

if (fecharMapa) {
  fecharMapa.addEventListener('click', () => {
    mapaModal.style.display = "none";
    iframeMapa.src = "";
  });
  fecharMapa.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      mapaModal.style.display = "none";
      iframeMapa.src = "";
    }
  });
}

window.addEventListener('click', e => {
  if (e.target === mapaModal) {
    mapaModal.style.display = "none";
    iframeMapa.src = "";
  }
});
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && mapaModal.style.display === 'block') {
    mapaModal.style.display = "none";
    iframeMapa.src = "";
  }
});
