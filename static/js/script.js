  
class ChurchTimeApp {

    constructor() {
    
        this.running = false;
        this.animationFrameId = null;
        this.canvas = null;
        this.ctx = null;
        this.particles = [];       
        this.swRegistration = null;
        //this.permission = Notification.permission;
        this.permission = this.getSafeNotificationPermission();
        
        this.baseURL = window.location.origin;
        this.data = {
            currentUser: null,
            users: [],
            scales: [],
            ministries: [],
            songs: [],
            roles: ['Vocal', 'Violão', 'Baixo', 'Bateria', 'Teclado', 'Violino', 'Flauta', 'Director', 'Backing Vocal', 'Solista'],
            chatMessages: [],
            unavailabilityRequests: []
        };
        
        this.state = {
            currentScaleId: null,
            currentMemberId: null,
            currentMinistryId: null,
            currentSongId: null,
            currentNotificationId: null,
            currentTab: 'home',
            currentNav: 'home',
            currentMonth: new Date().getMonth(),
            currentYear: new Date().getFullYear(),
            chatInterval: null,
            selectedDate: null
        };
        
        this.init();
    }
    
 // 🔥 Método seguro para verificar permissão
    getSafeNotificationPermission() {
        // 1. Primeiro verifica se está em WebView Android
        const isAndroidWebView = /wv|Android.*AppleWebKit/.test(navigator.userAgent);
        
        if (isAndroidWebView) {
            console.log('📱 WebView Android - Notificações web desativadas');
            return 'denied'; // Força como negado no WebView
        }
        
        // 2. Só usa Notification API se disponível e não for WebView
        if (typeof Notification === 'undefined') {
            return 'default';
        }
        
        // 3. Retorna a permissão real apenas para navegadores normais
        return Notification.permission;
    }
    
     // 🔥 Método para detectar WebView Android
    isAndroidWebView() {
        return /wv|Android.*AppleWebKit/.test(navigator.userAgent) ||
               typeof Android !== 'undefined';
    }
    
    // 🔥 Configura notificações para Android nativo
    setupAndroidNotifications() {
        if (typeof Android !== 'undefined') {
            console.log('🔗 Usando bridge Android para notificações');
            
            // Sobrescreve métodos para usar Android nativo
            this.showNotification = function(title, options = {}) {
                Android.showNotification(
                    title, 
                    options.body || '', 
                    options.type || 'info'
                );
                return true;
            };
            
            this.requestPermission = function() {
                // No Android, notificações já são permitidas pela bridge
                return Promise.resolve('granted');
            };
        } else {
            console.warn('WebView Android sem bridge - notificações desativadas');
        }
    }
async apiCall(endpoint, method = 'GET', data = null) {
    // Buscar o token SEMPRE do localStorage
    let currentToken = '';
    let currentUser = null;
    
    try {
        const savedUser = localStorage.getItem('churchTimeUser');
        if (savedUser && savedUser !== 'undefined' && savedUser !== 'null') {
            const userData = JSON.parse(savedUser);
            currentToken = userData.token || '';
            currentUser = userData;
        }
    } catch (e) {
        console.warn('⚠️ Erro ao recuperar token do localStorage:', e);
    }

    const config = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    // SEMPRE adicionar Authorization se tiver token
    if (currentToken) {
        config.headers['Authorization'] = `Bearer ${currentToken}`;
        console.log('🔐 Token incluído na requisição para:', endpoint);
    } else {
        console.warn('⚠️ Nenhum token encontrado para a requisição:', endpoint);
        
        // CORREÇÃO: Não fazer logout automaticamente para endpoints públicos
        const publicEndpoints = ['/login', '/register', '/health'];
        const isPublicEndpoint = publicEndpoints.some(publicEndpoint => 
            endpoint.startsWith(publicEndpoint)
        );
        
        if (!isPublicEndpoint) {
            // Apenas mostrar toast, não fazer logout imediato
            this.showToast('Sessão expirada. Redirecionando para login...', 'error');
            setTimeout(() => {
                if (this.isLoggedIn()) {
                    // Se ainda está logado, não faz logout
                    return;
                }
                this.logout();
            }, 3000);
            throw new Error('Token não encontrado');
        }
    }

    if (data && method !== 'GET') {
        config.body = JSON.stringify(data);
    }

    try {
        const response = await fetch(`${this.baseURL}${endpoint}`, config);
        
        // Verificar se a resposta é JSON
        const contentType = response.headers.get('content-type');
        let result;
        
        if (contentType && contentType.includes('application/json')) {
            result = await response.json();
        } else {
            const text = await response.text();
            throw new Error(`Resposta não JSON: ${text}`);
        }
        
        if (!response.ok) {
            console.error('❌ API Error Response:', result);
            
            // Se for erro 401 (Unauthorized), fazer logout
            if (response.status === 401) {
                console.log('🔐 Token inválido ou expirado, fazendo logout...');
                this.showToast('Sessão expirada. Faça login novamente.', 'error');
                setTimeout(() => {
                    this.logout();
                }, 2000);
            }
            
            throw new Error(result.error || result.msg || `Erro ${response.status}: ${response.statusText}`);
        }
        
        return result;
        
    } catch (error) {
        console.error('💥 API Call Error:', {
            endpoint,
            method,
            error: error.message,
            hasToken: !!currentToken
        });
        
        // CORREÇÃO: Não fazer logout para erros de rede
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            this.showToast('Erro de conexão. Verifique sua internet.', 'error');
            throw new Error('Erro de conexão com o servidor');
        }
        
        throw error;
    }
}


notifyLogin(title, msg) {
        // 1. Se já tem permissão, mostra notificação
        if (this.permission === "granted") {
            this.showWelcomeNotification(title, msg);
            return true;
        }
        
        // 2. Se nunca pediu, pede permissão
        if (this.permission === "default") {
            this.requestPermissionAndNotify(title, msg);
            return false; // Ainda não tem permissão
        }
        
        // 3. Se foi negada
        console.log("Permissão para notificações negada pelo usuário");
        return false;
    }

    // Pedir permissão e notificar (ASSINCRONO mas não bloqueia)
    requestPermissionAndNotify(title, msg) {
        Notification.requestPermission().then((permission) => {
            this.permission = permission;
            
            if (permission === "granted") {
                this.showWelcomeNotification(title, msg);
                console.log("Permissão concedida! Notificação enviada.");
            }
        }).catch(error => {
            console.error("Erro ao pedir permissão:", error);
        });
    }


    // Mostrar notificação de boas-vindas
    showWelcomeNotification(title, msg) {
        // Tenta com Service Worker primeiro
        if (this.swRegistration) {
            this.showLocalNotification(`${title}!`, {
                body: msg,
                icon: 'static/img/logo.png'
            }).catch(error => {
                // Fallback: notificação normal
                this.showFallbackNotification(title, msg);
            });
        } else {
            // Notificação normal sem Service Worker
            this.showFallbackNotification(title, msg);
        }
    }

    // Notificação normal (sem Service Worker)
    showFallbackNotification(title, msg) {
        try {
            const notification = new Notification(`${title}!`, {
                body: msg,
                icon: '/static/img/logo.png',
                badge: '/static/img/logo.png'
            });
            
            // Fecha após 5 segundos
            setTimeout(() => notification.close(), 5000);
            
            // Ao clicar
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
            
            return notification;
        } catch (error) {
            console.error("Erro ao criar notificação:", error);
        }
    }

    // Método auxiliar com Service Worker (opcional)
    async showLocalNotification(title, options = {}) {
        if (!this.swRegistration) {
            await this.registerServiceWorker();
        }
        
        const defaultOptions = {
            body: '',
            icon: '/icon.png',
            data: { url: window.location.href }
        };
        
        return this.swRegistration.showNotification(title, { 
            ...defaultOptions, 
            ...options 
        });
    }



  safeJsonParse(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }
        return [];
    }
 initializeUser(userData) {
    if (!userData) {
        console.error('Dados do usuário são nulos');
        return;
    }

    // CORREÇÃO: Backup do token atual antes de qualquer coisa
    const currentToken = this.data.currentUser?.token || userData.token;
    
    this.data.currentUser = {
        id: userData.id || 0,
        name: userData.name || '',
        email: userData.email || '',
        phone: userData.phone || '',
        role: userData.role || 'membro',
        skills: this.safeJsonParse(userData.skills),
        ministries: this.safeJsonParse(userData.ministries),
        permissions: this.safeJsonParse(userData.permissions),
        token: userData.token || currentToken || '', // ← SEMPRE garantir token
        notifications: userData.notifications || [],
        unavailability: userData.unavailability || []
    };

    // VALIDAÇÃO CRÍTICA: Se não tem token, não salva
    if (!this.data.currentUser.token) {
        console.error('🚨 CRÍTICO: Tentativa de inicializar usuário sem token!');
        this.showToast('Erro de autenticação. Faça login novamente.', 'error');
        setTimeout(() => this.logout(), 2000);
        return;
    }

    console.log('💾 Salvando usuário no localStorage com token:', !!this.data.currentUser.token);
    try {
        localStorage.setItem('churchTimeUser', JSON.stringify(this.data.currentUser));
        console.log('✅ Usuário salvo no localStorage com sucesso');
    } catch (e) {
        console.error('❌ Erro ao salvar usuário no localStorage:', e);
        this.showToast('Erro ao salvar sessão', 'error');
    }
}
   clearCorruptedStorage() {
    try {
        const savedUser = localStorage.getItem('churchTimeUser');
        if (savedUser === 'undefined' || savedUser === 'null' || !savedUser) {
            localStorage.removeItem('churchTimeUser');
            console.log('🧹 Storage corrompido limpo');
            return;
        }
        
        // Tentar parsear para verificar se é JSON válido
        const userData = JSON.parse(savedUser);
        if (!userData || !userData.token) {
            localStorage.removeItem('churchTimeUser');
            console.log('🧹 Token inválido removido');
        }
    } catch (e) {
        console.error('❌ Erro ao limpar storage:', e);
        localStorage.removeItem('churchTimeUser');
    }
}
init() {

    this.clearCorruptedStorage();
    //this.protectUserToken();
    this.setupEventListeners();

    if (this.isLoggedIn()) {
        try {
            const savedUser = localStorage.getItem('churchTimeUser');
            const userData = JSON.parse(savedUser);

            if (!userData) throw new Error("Usuário inválido");

            this.initializeUser(userData);
            this.showApp();
            this.stopLoginBackground();

            // Permissões
            this.loadAvailablePermissions();
            
            if (this.isAndroidWebView()) {
            console.log('🚫 Modo WebView Android - Notificações via bridge nativa');
            this.setupAndroidNotifications();
            return;
        }

        } catch (e) {
            console.warn("Sessão inválida, forçando logout");
            localStorage.removeItem('churchTimeUser');
            this.showLogin();
            this.startLoginBackground();
        }

    } else {
        this.showLogin();
        this.startLoginBackground();
    }
}

loadMusicManagementScreen() {
    // ✅ Mude de isLeader() para isWorshipLeader()
    if (!this.isWorshipLeader()) {
        this.showToast('Acesso negado. Apenas líderes do ministério de louvor podem gerenciar músicas.', 'error');
        return this.loadDashboard();
    }

    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Gestão de Músicas do Louvor</h2>
            ${this.isWorshipLeader() ? '<span class="view-all" id="addMusicBtn">Nova Música</span>' : ''}
        </div>
        
        <div class="card">
            <div class="management-filters">
                <div class="filter-group">
                    <label>Pesquisar:</label>
                    <input type="text" class="form-input" id="musicSearch" placeholder="Buscar por título, artista...">
                </div>
                <div class="filter-group">
                    <div class="ministry-badge" style="background: var(--primary); color: white; padding: 5px 10px; border-radius: 4px;">
                        <i class="fas fa-music"></i> Ministério de Louvor
                    </div>
                </div>
            </div>
            
            <div id="musicManagementList">
                <div style="text-align: center; padding: 20px;">
                    <div class="loading-spinner"></div>
                    <p>Carregando músicas do repertório de louvor...</p>
                </div>
            </div>
        </div>
    </div>`;

    $('#appContent').html(content);
    this.loadMusicForManagement();

    // Event listeners - apenas se for líder DE LOUVOR
    if (this.isWorshipLeader()) {
        $('#addMusicBtn').click(() => this.openSongModal());
    }
    
    $('#musicSearch').on('input', () => this.filterMusicList());
}

async loadMusicForManagement() {
    try {
        // ✅ VERIFICAÇÃO LOCAL primeiro
        if (!this.isWorshipLeader()) {
            this.showToast('Apenas líderes do ministério de louvor podem gerenciar músicas.', 'error');
            $('#musicManagementList').html(`
                <div style="text-align: center; padding: 40px; color: var(--danger);">
                    <i class="fas fa-ban" style="font-size: 2rem; margin-bottom: 15px;"></i>
                    <h3>Acesso Negado</h3>
                    <p>Apenas líderes do ministério de louvor podem gerenciar músicas.</p>
                    <p style="font-size: 0.9rem; margin-top: 10px;">
                        <small>Se você acredita que deveria ter acesso, verifique se é líder do ministério "Louvor".</small>
                    </p>
                </div>
            `);
            return;
        }

        this.showLoading('Carregando músicas do repertório...');
        
        // Agora faz a requisição (já sabemos que tem permissão)
        const response = await this.apiCall('/songs');
        
        if (response && response.success) {
            this.renderMusicManagement(response.data.songs || []);
        } else {
            this.showToast(response?.error || 'Erro ao carregar músicas', 'error');
            $('#musicManagementList').html(`
                <div style="text-align: center; padding: 40px; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar músicas</p>
                    <button class="btn btn-sm btn-outline" onclick="churchTimeApp.loadMusicForManagement()">
                        Tentar novamente
                    </button>
                </div>
            `);
        }
    } catch (error) {
        console.error('Erro ao carregar músicas:', error);
        this.showToast('Erro de conexão', 'error');
        $('#musicManagementList').html(`
            <div style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fas fa-wifi"></i>
                <p>Erro de conexão</p>
                <button class="btn btn-sm btn-outline" onclick="churchTimeApp.loadMusicForManagement()">
                    Tentar novamente
                </button>
            </div>
        `);
    } finally {
        this.hideLoading();
    }
}

renderMusicManagement(songs) {
    const container = $('#musicManagementList');
    const isWorshipLeader = this.isWorshipLeader();
    
    if (!songs || songs.length === 0) {
        container.html(`
        <div style="text-align: center; padding: 40px 20px;">
            <i class="fas fa-music" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
            <h3 style="color: var(--text-secondary); margin-bottom: 10px; font-size: 1.2rem;">Nenhuma música cadastrada</h3>
            <p style="color: var(--text-tertiary); font-size: 0.9rem; margin-bottom: 20px;">
                ${isWorshipLeader ? 'Comece adicionando músicas ao repertório do ministério.' : 'Aguarde o líder de louvor adicionar músicas.'}
            </p>
            ${isWorshipLeader ? `
            <button class="btn btn-primary" id="createFirstMusic" style="padding: 12px 24px; font-size: 0.9rem;">
                <i class="fas fa-plus"></i> <span class="btn-text">Adicionar Primeira Música</span>
            </button>
            ` : ''}
        </div>`);
        
        if (isWorshipLeader) {
            $('#createFirstMusic').click(() => this.openSongModal());
        }
        return;
    }

    let html = `
    <div class="music-management-header" style="margin-bottom: 20px; padding: 10px; background: var(--card-bg); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <i class="fas fa-music" style="color: var(--primary); margin-right: 10px;"></i>
                <span>Repertório do Ministério</span>
            </div>
            <div>
                <span class="badge" style="background: var(--primary); color: white; padding: 3px 8px; display: block ruby; border-radius: 12px;">
                    ${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}
                </span>
            </div>
        </div>
    </div>`;
    
    songs.forEach(song => {
        const hasYouTube = song.youtubeId && song.youtubeId.trim() !== '';
        const hasLyrics = song.lyrics && song.lyrics.trim() !== '';
        const hasChords = song.chords && song.chords.trim() !== '';
        const tags = song.tags && Array.isArray(song.tags) ? song.tags.join(', ') : '';
        
        // Resumo da letra (primeiras 100 caracteres)
        const lyricsPreview = hasLyrics ? 
            song.lyrics.substring(0, 100).replace(/\n/g, ' ') + (song.lyrics.length > 100 ? '...' : '') : 
            'Sem letra cadastrada';
        
        // Resumo da cifra
        const chordsPreview = hasChords ? 
            song.chords.substring(0, 50).replace(/\n/g, ' ') + (song.chords.length > 50 ? '...' : '') : 
            'Sem cifra cadastrada';
        
        html += `
        <div class="management-music-item" data-song-id="${song.id}">
            <div class="music-info">
                <div class="music-avatar" style="background: ${hasYouTube ? 'var(--danger)' : 'var(--secondary)'};">
                    <i class="fas ${hasYouTube ? 'fa-play' : 'fa-music'}"></i>
                </div>
                <div class="music-details">
                    <div class="music-title" title="${song.title}">${song.title}</div>
                    <div class="music-artist" title="${song.artist}">${song.artist}</div>
                    
                    <!-- NOVO: Mostrar resumo da letra e cifra -->
                    <div class="music-extras" style="margin-top: 8px; font-size: 0.85rem;">
                        ${hasLyrics ? `
                        <div class="music-lyrics-preview" title="Letra: ${song.lyrics.replace(/"/g, '&quot;')}">
                            <i class="fas fa-file-alt" style="color: var(--primary); margin-right: 5px;"></i>
                            <span style="color: var(--text-secondary);">${lyricsPreview}</span>
                        </div>
                        ` : ''}
                        
                        ${hasChords ? `
                        <div class="music-chords-preview" title="Cifra: ${song.chords.replace(/"/g, '&quot;')}">
                            <i class="fas fa-guitar" style="color: var(--success); margin-right: 5px;"></i>
                            <span style="color: var(--text-secondary);">${chordsPreview}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="music-meta">
                        ${song.duration ? `<span class="music-duration"><i class="fas fa-clock"></i> ${song.duration}</span>` : ''}
                        ${hasYouTube ? `<span class="music-youtube"><i class="fab fa-youtube"></i> <span class="meta-text">YouTube</span></span>` : ''}
                        ${tags ? `<span class="music-tags"><i class="fas fa-tags"></i> <span class="meta-text">${tags}</span></span>` : ''}
                        ${hasLyrics ? `<span class="music-lyrics-badge"><i class="fas fa-file-alt"></i> <span class="meta-text">Letra</span></span>` : ''}
                        ${hasChords ? `<span class="music-chords-badge"><i class="fas fa-guitar"></i> <span class="meta-text">Cifra</span></span>` : ''}
                    </div>
                </div>
            </div>
            <div class="music-actions">
                ${hasYouTube ? `
                <button class="btn btn-outline btn-preview-music" data-song-id="${song.id}" data-youtube="${song.youtubeId}" title="Prévia">
                    <i class="fas fa-play"></i> <span class="btn-text">Prévia</span>
                </button>
                ` : ''}
                
                <!-- NOVO: Botões para ver letra e cifra -->
                ${hasLyrics || hasChords ? `
                <button class="btn btn-outline btn-view-lyrics-chords" data-song-id="${song.id}" title="Ver Letra e Cifra">
                    <i class="fas fa-eye"></i> <span class="btn-text">Letra/Cifra</span>
                </button>
                ` : ''}
                
                ${isWorshipLeader ? `
                <button class="btn btn-outline btn-edit-music" data-song-id="${song.id}" title="Editar">
                    <i class="fas fa-edit"></i> <span class="btn-text">Editar</span>
                </button>
                <button class="btn btn-danger btn-delete-music" data-song-id="${song.id}" title="Excluir">
                    <i class="fas fa-trash"></i> <span class="btn-text">Excluir</span>
                </button>
                ` : ''}
            </div>
        </div>`;
    });

    container.html(html);
    this.setupMusicManagementEvents();
}

// NOVO MÉTODO: Mostrar letra e cifra completas
showLyricsAndChords(songId) {
    const song = this.data.songs.find(s => s.id === songId);
    if (!song) return;
    
    const hasLyrics = song.lyrics && song.lyrics.trim() !== '';
    const hasChords = song.chords && song.chords.trim() !== '';
    
    if (!hasLyrics && !hasChords) {
        this.showToast('Esta música não tem letra ou cifra cadastrada', 'info');
        return;
    }
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 800px; max-height: 90vh;">
            <div class="modal-header">
                <h3 class="modal-title">${song.title} - ${song.artist}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto; max-height: 70vh;">
                <div class="lyrics-chords-container">
                    ${hasLyrics ? `
                    <div class="lyrics-section" style="margin-bottom: 30px;">
                        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4 style="color: var(--primary);">
                                <i class="fas fa-file-alt"></i> Letra da Música
                            </h4>
                            <button class="btn btn-sm btn-outline btn-copy" data-text="${song.lyrics.replace(/"/g, '&quot;')}">
                                <i class="fas fa-copy"></i> Copiar
                            </button>
                        </div>
                        <div class="lyrics-content" style="white-space: pre-wrap; font-family: 'Courier New', monospace; line-height: 1.6; padding: 15px; background: var(--card-bg); border-radius: 8px;">${song.lyrics}</div>

                    </div>
                    ` : ''}
                    
                    ${hasChords ? `
                    <div class="chords-section">
                        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                            <h4 style="color: var(--success);">
                                <i class="fas fa-guitar"></i> Cifra da Música
                            </h4>
                            <button class="btn btn-sm btn-outline btn-copy" data-text="${song.chords.replace(/"/g, '&quot;')}">
                                <i class="fas fa-copy"></i> Copiar
                            </button>
                        </div>
                        <div class="chords-content" style="white-space: pre-wrap; font-family: 'Courier New', monospace; line-height: 1.6; padding: 15px; background: var(--card-bg); border-radius: 8px;">${song.chords}</div>

                    </div>
                    ` : ''}
                    
                    ${!hasLyrics && !hasChords ? `
                    <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                        <i class="fas fa-music" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h4>Nenhuma letra ou cifra disponível</h4>
                        <p>Esta música ainda não tem letra ou cifra cadastrada.</p>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-close-modal">Fechar</button>
                ${this.isWorshipLeader() ? `
                <button class="btn btn-primary btn-edit-lyrics-chords" data-song-id="${song.id}">
                    <i class="fas fa-edit"></i> Editar Letra/Cifra
                </button>
                ` : ''}
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Event listener para copiar texto
    modal.find('.btn-copy').click(function() {
        const text = $(this).data('text');
        navigator.clipboard.writeText(text).then(() => {
            const originalText = $(this).html();
            $(this).html('<i class="fas fa-check"></i> Copiado!');
            setTimeout(() => {
                $(this).html(originalText);
            }, 2000);
        });
    });
    
    // Event listener para editar
    if (this.isWorshipLeader()) {
        modal.find('.btn-edit-lyrics-chords').click(() => {
            modal.remove();
            this.openSongModal(songId);
        });
    }
    
    // Event listeners para fechar
    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

setupMusicManagementEvents() {
    const isLeader = this.isLeader();
    
    // Prévia do YouTube - disponível para todos
    $(document).off('click', '.btn-preview-music').on('click', '.btn-preview-music', (e) => {
        const songId = $(e.currentTarget).data('song-id');
        const youtubeId = $(e.currentTarget).data('youtube');
        this.showMusicPreview(songId, youtubeId);
    });
     
     $(document).off('click', '.btn-view-lyrics-chords').on('click', '.btn-view-lyrics-chords', (e) => {
    const songId = $(e.currentTarget).data('song-id');
    this.showLyricsAndChords(songId);
});

    // Apenas líderes podem editar e excluir
    if (isLeader) {
        // Editar música
        $(document).off('click', '.btn-edit-music').on('click', '.btn-edit-music', (e) => {
            const songId = $(e.currentTarget).data('song-id');
            this.openSongModal(songId);
        });

        // Excluir música
        $(document).off('click', '.btn-delete-music').on('click', '.btn-delete-music', (e) => {
            const songId = $(e.currentTarget).data('song-id');
            this.deleteMusic(songId);
        });
    }
}
filterMusicList() {
    const searchTerm = $('#musicSearch').val().toLowerCase();
    const musicItems = $('.management-music-item');
    
    musicItems.each(function() {
        const title = $(this).find('.music-title').text().toLowerCase();
        const artist = $(this).find('.music-artist').text().toLowerCase();
        const tags = $(this).find('.music-tags').text().toLowerCase();
        
        if (title.includes(searchTerm) || artist.includes(searchTerm) || tags.includes(searchTerm)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
}

showMusicPreview(songId, youtubeId) {
    const song = this.data.songs.find(s => s.id === songId);
    if (!song) return;
    
    const isLeader = this.isLeader();
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3 class="modal-title">${song.title} - ${song.artist}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="youtube-preview" style="margin: 0;">
                    <div id="youtubePlayer"></div>
                </div>
                <div class="music-preview-info" style="margin-top: 20px; text-align: center;">
                    <h4>${song.title}</h4>
                    <p style="color: var(--text-secondary);">${song.artist}</p>
                    ${song.duration ? `<p><i class="fas fa-clock"></i> Duração: ${song.duration}</p>` : ''}
                    ${song.tags && song.tags.length > 0 ? `
                    <p><i class="fas fa-tags"></i> Tags: ${song.tags.join(', ')}</p>
                    ` : ''}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-close-modal">Fechar</button>
                ${isLeader ? `
                <button class="btn btn-primary btn-edit-from-preview" data-song-id="${song.id}">
                    <i class="fas fa-edit"></i> Editar Música
                </button>
                ` : ''}
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Carregar player do YouTube
    if (youtubeId) {
        this.showYouTubePreview(modal, youtubeId, `${song.title} - ${song.artist}`);
    }
    
    // Event listeners
    modal.find('.modal-close, .btn-close-modal').on('click', () => {
        modal.remove();
    });
    
    if (isLeader) {
        modal.find('.btn-edit-from-preview').on('click', () => {
            modal.remove();
            this.openSongModal(songId);
        });
    }
    
   // modal.on('click', (e) => {
   //     if (e.target === modal[0]) {
   //         modal.remove();
   //     }
   // });
}

async deleteMusic(songId) {
    if (!confirm('Tem certeza que deseja excluir esta música? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        this.showLoading('Excluindo música...');
        
        const response = await this.apiCall('/songs', 'DELETE', { id: songId });
        
        if (response && response.success) {
            this.showToast('Música excluída com sucesso!');
            this.loadMusicForManagement(); // Recarregar a lista
        } else {
            this.showToast(response?.error || 'Erro ao excluir música', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

    setupEventListeners() {
        $(document).on('click', '#loginBtn', () => this.login());
        $(document).on('click', '#registerBtn', () => this.register());
        $(document).on('click', '#logoutBtn', () => this.logout());
        $(document).on('click', '#pendingRequestsBtn', () => this.loadPendingRequestsScreen());
	$(document).on('click', '#managementBtn', () => this.loadMemberManagementScreen());
	$(document).on('click', '#musicManagementBtn', () => this.loadMusicManagementScreen());

        $(document).on('click', '.login-tab', (e) => {
            const tab = $(e.target).data('tab');
            $('.login-tab').removeClass('active');
            $(e.target).addClass('active');

            if (tab === 'login') {
                $('#loginForm').show();
                $('#registerForm').hide();
            } else {
                $('#loginForm').hide();
                $('#registerForm').show();
            }
        });
        
        $(document).on('click', '#musicManagementBtn', (e) => {
    e.preventDefault();
    
    // ✅ Verificar se é líder de louvor, não apenas líder geral
    if (!this.isWorshipLeader()) {
        this.showToast('Acesso negado. Apenas líderes do ministério de louvor podem gerenciar músicas.', 'error');
        return;
    }
    
    this.loadMusicManagementScreen();
});

        $(document).on('click', '.nav-item', (e) => {
            const nav = $(e.target).closest('.nav-item').data('nav');
            this.handleBottomNav(nav);
        });
        
        $(document).on('click', '.nav-item2', (e) => {
            const nav = $(e.target).closest('.nav-item2').data('nav');
            this.handleBottomNav2(nav);
        });
         
         
         $(document).on('click', '.nav-item3', (e) => {
            const nav = $(e.target).closest('.nav-item3').data('nav');
            this.handleBottomNav3(nav);
        });
        
        $(document).on('click', '#notificationsBtn', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔔 Botão de notificações clicado');
    
    // Primeiro, marcar todas as notificações como lidas
    const unreadCount = this.data.currentUser?.notifications?.filter(n => 
        n.is_read === 0 || n.is_read === false
    ).length || 0;
    
    if (unreadCount > 0) {
        console.log(`📝 Marcando ${unreadCount} notificação(ões) como lida(s)...`);
        await this.markAllNotificationsAsRead();
    }
    
    // Depois, mostrar a tela de notificações
    this.showNotifications();
});
        $(document).on('click', '#settingsBtn', () => this.showSettings());

        $(document).on('click', '.modal-close, .btn-cancel', function (e) {
            e.preventDefault();
            e.stopPropagation();
            $(this).closest('.modal').remove();
        });

        //$(document).on('click', '.modal', function (e) {
        //    if (e.target === this) {
        //        $(this).remove();
        //    }
        //});

        $(document).on('click', '.modal-content', function (e) {
            e.stopPropagation();
        });

        $(document).on('click', '.calendar-day', (e) => {
            const date = $(e.target).data('date');
            if (date) {
                this.showEventsForDate(date);
            }
        });
    }

    showLogin() {
        $('#loginScreen').show();
        $('#appScreen').hide();
    }

    // Corrija o login para garantir que o token seja passado corretamente
async login() {
    const email = $('#loginEmail').val();
    const password = $('#loginPassword').val();

    if (!email || !password) {
        this.showToast('Preencha todos os campos!', 'error');
        return;
    }

    try {
        this.showLoading('Entrando...');
        
        // Fazer login SEM token no header (primeira requisição)
        const response = await fetch(`${this.baseURL}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Email ou senha incorretos!');
        }
        
        if (result.success && result.data && result.data.user) {
            console.log('✅ Login bem-sucedido, token recebido:', !!result.data.token);
            
            // Garantir que o token seja incluído nos dados do usuário
            const userData = {
                ...result.data.user,
                token: result.data.token // ← IMPORTANTE: incluir o token
            };
            
            this.stopLoginBackground();
document.getElementById("loginScreen").style.display = "none";
document.getElementById("appScreen").style.display = "block";	    
            
            this.initializeUser(userData);
            this.showApp();
            //this.showToast('Login realizado com sucesso!');
            this.notifyLogin(`👋 Bem-vindo, ${userData.name}!`, `Login Realizado com sucesso`);
        } else {
            this.showToast(result.error || 'Email ou senha incorretos!', 'error');
        }
    } catch (error) {
        this.showToast(error.message, 'error');
    } finally {
        this.hideLoading();
    }
}


// Métodos específicos para diferentes tipos de permissão
isWorshipLeader() {
    return this._isLeaderOfMinistryType('louvor');
}

isCommunicationLeader() {
    return this._isLeaderOfMinistryType('comunicação') || 
           this._isLeaderOfMinistryType('vértice') ||
           this._isLeaderOfMinistryType('projeção');
}

// Método genérico
_isLeaderOfMinistryType(keyword) {
    if (!this.data.currentUser) return false;
    
    if (this.data.currentUser.role === 'admin') return true;
    if (this.data.currentUser.role !== 'lider') return false;
    
    // Buscar ministério com a palavra-chave
    const ministry = this.data.ministries.find(m => 
        m.name.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (!ministry) return false;
    
    return parseInt(ministry.leader) === this.data.currentUser.id;
}
// Método para mostrar qual ministério o usuário lidera
getUserLedMinistries() {
    if (!this.data.currentUser) return [];
    
    const ledMinistries = this.data.ministries.filter(ministry => 
        parseInt(ministry.leader) === this.data.currentUser.id
    );
    
    return ledMinistries.map(m => m.name);
}

// No loadDashboard() ou similar, você pode mostrar:
showUserLeadershipInfo() {
    if (this.data.currentUser?.role === 'lider') {
        const ledMinistries = this.getUserLedMinistries();
        console.log('👑 Ministérios liderados:', ledMinistries);
        
        if (ledMinistries.length > 0) {
            const worshipMinistry = ledMinistries.find(name => 
                name.toLowerCase().includes('louvor')
            );
            
            if (worshipMinistry) {
                console.log(`🎵 ${this.data.currentUser.name} é líder do ministério de louvor: ${worshipMinistry}`);
            }
        }
    }
}
isLoggedIn() {
    try {
        const savedUser = localStorage.getItem('churchTimeUser');
        if (!savedUser || savedUser === 'undefined' || savedUser === 'null') {
            return false;
        }
        
        const userData = JSON.parse(savedUser);
        const hasValidToken = !!(userData && userData.token && userData.token.trim() !== '');
        const hasValidId = !!(userData && userData.id);
        
        console.log('🔐 Verificação de login:', { 
            hasUserData: !!userData, 
            hasValidToken, 
            hasValidId,
            tokenLength: userData?.token?.length 
        });
        
        return hasValidToken && hasValidId;
    } catch (e) {
        console.error('❌ Erro ao verificar login:', e);
        return false;
    }
}


setupParticles() {
    this.canvas = document.getElementById("particles");
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");

    const resize = () => {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    };

    window.addEventListener("resize", resize);
    resize();

    const count = window.innerWidth < 600 ? 50 : 120;

    this.particles = Array.from({ length: count }, () => ({
        x: Math.random() * this.canvas.width,
        y: this.canvas.height + Math.random() * 100,
        size: Math.random() * 2 + 1,
        speed: Math.random() * 0.6 + 0.2,
        alpha: Math.random() * 0.5 + 0.3
    }));
}

animateParticles() {
    if (!this.running || !this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.particles.forEach(p => {
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(180,120,255,${p.alpha})`;
        this.ctx.fill();

        p.y -= p.speed;
        if (p.y < -10) {
            p.y = this.canvas.height + 10;
            p.x = Math.random() * this.canvas.width;
        }
    });

    this.animationFrameId = requestAnimationFrame(this.animateParticles.bind(this));
}


stopLoginBackground() {
    this.running = false;

    if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
    }

    const bg = document.getElementById("loginBackground");
    if (bg) bg.remove();
}


startLoginBackground() {
    if (this.running) return;

    this.running = true;

    if (!document.getElementById("loginBackground")) {
        const bg = document.createElement("div");
        bg.id = "loginBackground";
        bg.innerHTML = `
            <div class="background"></div>
            <canvas id="particles"></canvas>
        `;
        document.body.prepend(bg);
    }

    this.setupParticles();
    this.animateParticles();
}


logout() {
    console.log('🚪 Fazendo logout...');

    this.stopNotificationPolling();
    this.stopLoginBackground(); // garante limpeza total

    this.data.currentUser = null;
    localStorage.removeItem('churchTimeUser');

    document.getElementById("appScreen").style.display = "none";
    document.getElementById("loginScreen").style.display = "flex";

    this.startLoginBackground();
    this.showToast('Logout realizado com sucesso!');
}
    toggleLeaderMenu() {
    const isLeader = this.isLeader();
    const isMember = this.data.currentUser?.role === 'membro';
    
    console.log('🔄 toggleLeaderMenu:', { 
        isLeader, 
        isMember, 
        userRole: this.data.currentUser?.role 
    });
    
    
    // Mostrar "Solicitações" apenas para líderes e admins
    $('.nav-item[data-nav="pending_requests"]').toggle(isLeader);
    
    // Mostrar/ocultar gestão no header para líderes
    $('#headerManagement').toggle(isLeader);
    
    $('.nav-item[data-nav="functions"]').toggle(isLeader);
    
    // CORREÇÃO: Mostrar "Membros" e "Ministérios" para não-membros
    $('.nav-item[data-nav="members"]').toggle(!isMember);
    
    $('.nav-item[data-nav="ministries"]').toggle(isLeader);
    
    // Mostrar "Gerenciamento" apenas para líderes e admins  
    $('.nav-item[data-nav="management"]').toggle(isLeader);
    
    // Mostrar "Membros" para todos exceto membros comuns
    $('.nav-item[data-nav="members"]').toggle(!isMember);
    
    // Mostrar "Membros" para todos exceto membros comuns
    $('.nav-item[data-nav="add"]').toggle(!isMember);
    
    // Mostrar "Ministérios" para todos exceto membros comuns
    $('.nav-item[data-nav="ministries"]').toggle(!isMember);
    
    // Menu inferior - sempre mostrar os 4 itens básicos
    $('.nav-item[data-nav="members"]').toggle(!isMember);
    
    
    // Mostrar calendário para todos
    $('.nav-item[data-nav="calendar"]').show();
    

    setTimeout(() => {
        const isVisible = $('.nav-item[data-nav="pending_requests"]').is(':visible');
        console.log('✅ Item "pending_requests" visível:', isVisible);
    }, 100);
}
     

     
    // No método showApp() ou após o login
updateHeaderUserInfo() {
    if (!this.data.currentUser) return;
    
    const user = this.data.currentUser;
    
    // Atualizar avatar
    $('#userAvatar').text(this.getInitials(user.name));
    
    // Atualizar nome e role
    $('#userName').text(user.name);
    $('#userRole').text(this.getRoleText(user.role));
    
    $('#userName_nav').text(user.name);
    $('#userRole_nav').text(this.getRoleText(user.role));
    
    // Atualizar notificações
    this.updateNotificationBadge(user.notifications || []);
}

getRoleText(role) {
    const roles = {
        'admin': 'Administrador',
        'lider': 'Líder',
        'membro': 'Membro'
    };
    return roles[role] || role;
}

 
async showApp() {
    $('#loginScreen').hide();
    $('#appScreen').show();

    this.toggleLeaderMenu();
    this.showLoading('Carregando dados...'); // ← Adicione mensagem
    
    console.log('🚀 showApp() chamado');
    console.log('- Usuário:', this.data.currentUser?.name);
    console.log('- É líder?', this.isLeader());
    console.log('- É líder de louvor?', this.isWorshipLeader());
    
    try {
        // PRIMEIRO: Carregar todos os dados da API
        await this.loadDataFromAPI();
        
        // DEPOIS: Renderizar o dashboard
        this.loadDashboard();
        this.updateHeaderUserInfo();
        this.updateHeaderButtonsVisibility();
        
        this.checkAndShowNotifications();
        this.startNotificationPolling();
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        this.showToast('Erro ao carregar dados do servidor', 'error');
        this.loadEmptyData();
        this.loadDashboard(); // Tenta carregar mesmo com dados vazios
    } finally {
        this.hideLoading();
    }
}

// Adicionar este método para verificar a saúde da sessão
async checkSessionHealth() {
    if (!this.isLoggedIn()) {
        return false;
    }
    
    try {
        // Fazer uma requisição simples para verificar se o token ainda é válido
        const response = await this.apiCall('/health').catch(() => null);
        return !!response;
    } catch (error) {
        console.warn('⚠️ Sessão pode estar expirada:', error);
        return false;
    }
}

// Atualizar o startNotificationPolling
startNotificationPolling() {
    console.log('🔔 Iniciando polling de notificações...');
    
    // Parar polling anterior se existir
    if (this.notificationInterval) {
        clearInterval(this.notificationInterval);
    }
    
    if (this.leaderInterval) {
        clearInterval(this.leaderInterval);
    }
    
    // Verificar saúde da sessão primeiro
    this.checkSessionHealth().then(isHealthy => {
        if (!isHealthy) {
            console.log('🔐 Sessão não está saudável, parando polling');
            return;
        }
        
        // Verificar notificações a cada 60 segundos
        this.notificationInterval = setInterval(async () => {
            if (this.data.currentUser && $('#appScreen').is(':visible')) {
                // Verificar saúde antes de fazer requisição
                const isHealthy = await this.checkSessionHealth();
                if (isHealthy) {
                    this.checkAndShowNotifications();
                } else {
                    this.stopNotificationPolling();
                }
            }
        }, 60000);
        
        // Verificação para líderes a cada 45 segundos
        if (this.isLeader()) {
            this.leaderInterval = setInterval(async () => {
                if (this.data.currentUser && $('#appScreen').is(':visible')) {
                    // Verificar saúde antes de fazer requisição
                    const isHealthy = await this.checkSessionHealth();
                    if (isHealthy) {
                        this.checkPendingRequests();
                    } else {
                        this.stopNotificationPolling();
                    }
                }
            }, 45000);
        }
    });
    
    // Também verificar quando o usuário volta para a aba
    $(document).on('visibilitychange', async () => {
        if (!document.hidden && this.data.currentUser) {
            const isHealthy = await this.checkSessionHealth();
            if (isHealthy) {
                setTimeout(() => {
                    this.checkAndShowNotifications();
                    if (this.isLeader()) {
                        this.checkPendingRequests();
                    }
                }, 1000);
            }
        }
    });
}

// Adicione este método para verificar conectividade
async checkConnectivity() {
    try {
        const response = await fetch(`${this.baseURL}/health`, { 
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        return response.ok;
    } catch (error) {
        console.warn('🔌 Problema de conectividade com o servidor');
        return false;
    }
}

stopNotificationPolling() {
    if (this.notificationInterval) {
        clearInterval(this.notificationInterval);
        this.notificationInterval = null;
    }
    
    if (this.leaderInterval) {
        clearInterval(this.leaderInterval);
        this.leaderInterval = null;
    }
    
    $(document).off('visibilitychange');
}




async loadDataFromAPI() {
    try {
        this.showLoading('Carregando dados...');
        console.log('🔄 Iniciando carregamento de dados...');

        // DEBUG: Antes das chamadas API
        console.log('🔍 ANTES das chamadas API');
        console.log('- Token existe:', !!this.data.currentUser?.token);
        console.log('- Token:', this.data.currentUser?.token?.substring(0, 20) + '...');

        // FAZER CHAMADAS INDIVIDUAIS PARA DEBUG
        console.log('📞 Fazendo chamada para /members...');
        const membersRes = await this.apiCall('/members/management');
        console.log('📊 Resposta de /members:', membersRes);
        
        // Se /members falhar, tentar /members/management
        let usersData = [];
        if (membersRes && membersRes.success) {
            usersData = membersRes.data.users || [];
            console.log('✅ /members retornou:', usersData.length, 'membros');
        } else {
            console.log('❌ /members falhou, tentando /members/management...');
            const managementRes = await this.apiCall('/members/management');
            if (managementRes && managementRes.success) {
                usersData = managementRes.data.users || [];
                console.log('✅ /members/management retornou:', usersData.length, 'membros');
            }
        }

        // AGORA FAZER AS OUTRAS CHAMADAS
        const [scalesRes, ministriesRes, songsRes] = await Promise.all([
            this.apiCall('/scales'),
            this.apiCall('/ministries'),
            this.apiCall('/songs')
        ]);

        // ATUALIZAR DADOS
        if (scalesRes && scalesRes.success) {
            this.data.scales = scalesRes.data.scales || [];
            console.log('✅ Escalas carregadas:', this.data.scales.length);
        }

        // ATUALIZAR MEMBROS (CRÍTICO)
        this.data.users = usersData;
        console.log('✅ Membros FINAIS carregados:', this.data.users.length);
        console.log('👥 Lista de membros:', this.data.users.map(u => u.name));

        if (ministriesRes && ministriesRes.success) {
            this.data.ministries = ministriesRes.data.ministries || [];
            console.log('✅ Ministérios carregadas:', this.data.ministries.length);
        }

        if (songsRes && songsRes.success) {
            this.data.songs = songsRes.data.songs || [];
            console.log('✅ Músicas carregadas:', this.data.songs.length);
        }

        this.hideLoading();
        this.updateInterface();
        this.updateHeaderButtonsVisibility(); // ✅ Adicione esta linha

    } catch (error) {
        this.hideLoading();
        console.error('💥 Erro ao carregar dados:', error);
        this.showToast('Erro ao carregar dados do servidor', 'error');
        this.loadEmptyData();
    }
}
    updateInterface() {
        if ($('#appScreen').is(':visible')) {
            if (this.state.currentNav === 'home') {
                this.loadDashboard();
            }

            switch (this.state.currentNav) {
                case 'members':
                    this.loadMembersScreen();
                    break;
                case 'ministries':
                    this.loadMinistriesScreen();
                    break;
                case 'calendar':
                    this.showCalendar();
                    break;
                case 'pending_requests':
                    this.loadPendingRequestsScreen();
                    break;
            }

            if (this.state.currentTab) {
                this.showTab(this.state.currentTab);
            }
        }
    }

    loadEmptyData() {
        this.data.scales = this.data.scales || [];
        this.data.users = this.data.users || [];
        this.data.ministries = this.data.ministries || [];
        this.data.songs = this.data.songs || [];

        if (this.data.users.length === 0 && this.data.currentUser) {
            this.data.users = [this.data.currentUser];
        }
    }

   loadDashboard() {
    if (!this.data.currentUser) return;

    const isMember = this.data.currentUser.role === 'membro';
    const canViewStats = this.hasPermission('escala_view_all') || this.isLeader();

    const content = `
    <div class="stats-grid">
        ${canViewStats ? `
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-users"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.users.length}</div>
                <div class="stat-label">Membros Ativos</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.scales.length}</div>
                <div class="stat-label">Escalas</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.ministries.length}</div>
                <div class="stat-label">Ministérios</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.scales.filter(s => s.status === 'confirmed').length}</div>
                <div class="stat-label">Confirmados</div>
            </div>
        </div>
        ` : `
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.getUserScalesCount()}</div>
                <div class="stat-label">Suas Escalas</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.currentUser.ministries?.length || 0}</div>
                <div class="stat-label">Seus Ministérios</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-user-clock"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.getUserUnavailabilityCount()}</div>
                <div class="stat-label">Indisponibilidades</div>
            </div>
        </div>
        
        <div class="stat-card fade-in">
            <div class="stat-header">
                <div class="stat-icon">
                    <i class="fas fa-bell"></i>
                </div>
            </div>
            <div class="stat-content">
                <div class="stat-value">${this.data.currentUser.notifications?.length || 0}</div>
                <div class="stat-label">Notificações</div>
            </div>
        </div>
        `}
    </div>
    
    <div class="content-section">
        <div class="section-header">
            <h2 class="section-title">${isMember ? 'Suas Próximas Escalas' : 'Próximas Escalas'}</h2>
            ${this.hasPermission('escala_create') ? '<button class="action-button" id="addScaleBtn">Nova Escala</button>' : ''}
            ${this.hasPermission('membros_gerenciar') ? '<!--<button class="action-button" id="reportsBtn_off">Relatórios</button>-->' : ''}
            
        </div>
        
        <div id="scalesList">
        </div>
    </div>`;

    $('#appContent').html(content);
    
    setTimeout(() => {
        this.renderScales();
        this.setupDashboardEventListeners();
    }, 100);
}
// Métodos auxiliares para membros
getUserScalesCount() {
    if (!this.data.currentUser) return 0;
    return this.data.scales.filter(scale => 
        scale.members && scale.members.some(m => m.id === this.data.currentUser.id)
    ).length;
}

getUserUnavailabilityCount() {
    if (!this.data.currentUser || !this.data.currentUser.unavailability) return 0;
    return this.data.currentUser.unavailability.length;
}

    setupDashboardEventListeners() {
        if (this.hasPermission('escala_create')) {
            $(document).off('click', '#addScaleBtn').on('click', '#addScaleBtn', () => {
                this.openScaleModal();
            });
          }  
         if (this.hasPermission('membros_gerenciar')) {
            $(document).off('click', '#reportsBtn').on('click', '#reportsBtn', () => {
                this.loadReportsScreen();
            });   
        }
    }
   //mikao
   hasPermission(permission) {
    if (!this.data.currentUser) {
        console.log(`❌ hasPermission(${permission}): Nenhum usuário`);
        return false;
    }
    
    if (!this.data.currentUser.permissions) {
        console.log(`❌ hasPermission(${permission}): Sem permissões definidas`);
        return false;
    }
    
    const hasAllPermission = this.data.currentUser.permissions.includes('all');
    const hasPermission = this.data.currentUser.permissions.includes(permission);
    
    console.log(`🔑 hasPermission(${permission}):`, {
        hasAllPermission,
        hasPermission,
        permissionsList: this.data.currentUser.permissions
    });
    
    return hasAllPermission || hasPermission;
}
 isLeader() {
    if (!this.data.currentUser) return false;
    return this.data.currentUser.role === 'lider' || this.data.currentUser.role === 'admin';
}

    // Verificar se é líder de um ministério específico
    isLeaderOfMinistry(ministryId) {
        if (!this.data.currentUser || !this.data.currentUser.led_ministries) return false;
        return this.data.currentUser.led_ministries.includes(parseInt(ministryId));
    }
    
// Método renderScales completo com escalas mensais
renderScales() {
    const scalesList = $('#scalesList');
    console.log('🔍 renderScales chamado, scalesList encontrado:', scalesList.length);
    
    if (scalesList.length === 0) return;

    // Obter todas as escalas (únicas e mensais)
    let userScales = this.data.scales || [];
    
    console.log('📊 Total de escalas no sistema:', userScales.length);

    // 🔴 CORREÇÃO: Verificar permissões CORRETAMENTE
    const hasViewAllPermission = this.hasPermission('escala_view_all');
    const isUserLeader = this.isLeader();
    
    console.log('🔑 Permissões do usuário:', {
        hasViewAllPermission,
        isUserLeader,
        userRole: this.data.currentUser?.role,
        permissions: this.data.currentUser?.permissions
    });

    // Se não pode ver todas as escalas, filtrar
    if (!hasViewAllPermission && !isUserLeader) {
        console.log('🔒 Usuário não pode ver todas as escalas, filtrando...');
        
        userScales = userScales.filter(scale => {
            // Verificar se é membro da escala
            const isMember = scale.members && scale.members.some(m => 
                m.id === this.data.currentUser?.id
            );
            
            // Verificar se é do ministério do usuário
            const userMinistries = this.data.currentUser?.ministries || [];
            const hasMinistryAccess = userMinistries.includes(parseInt(scale.ministry));
            
            // Verificar se é líder deste ministério específico
            const isLeaderOfThisMinistry = this.isLeaderOfMinistry(scale.ministry);
            
            console.log(`📋 Escala ${scale.id} [${scale.event}]:`, {
                isMember,
                hasMinistryAccess,
                isLeaderOfThisMinistry
            });
            
            return isMember || hasMinistryAccess || isLeaderOfThisMinistry;
        });
    } else {
        console.log('✅ Usuário pode ver todas as escalas');
    }

    console.log('🎯 Escalas filtradas para usuário:', userScales.length);

    // Separar escalas únicas de grupos mensais
    const singleScales = userScales.filter(s => !s.scale_group || s.scale_type !== 'monthly_group');
    const monthlyScaleGroups = this.groupMonthlyScales(userScales);
    
    console.log('📅 Escalas únicas:', singleScales.length);
    console.log('🗓️ Grupos mensais:', monthlyScaleGroups.length);

    // Ordenar escalas únicas por data (mais recente primeiro)
    singleScales.sort((a, b) => {
        const dateA = new Date(a.date + 'T' + (a.time || '00:00'));
        const dateB = new Date(b.date + 'T' + (b.time || '00:00'));
        return dateB - dateA; // Mais recente primeiro
    });

    let scalesHtml = '';

    // SECTION 1: ESCALAS MENSAIS (se houver)
    if (monthlyScaleGroups.length > 0) {
        scalesHtml += `
        <div class="monthly-scales-section" style="margin-bottom: 30px;">
            <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-light);">
                <h2 style="color: var(--primary); font-size: 1.3rem; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-calendar-alt"></i> Escalas Mensais Programadas
                </h2>
                <div class="monthly-stats" style="display: flex; gap: 15px;">
                    <span class="stat-badge" style="background: var(--primary-light); color: White; padding: 5px 10px; border-radius: 20px; font-size: 0.9rem;">
                        <i class="fas fa-layer-group"></i> ${monthlyScaleGroups.length} programaç${monthlyScaleGroups.length === 1 ? 'ão' : 'ões'}
                    </span>
                    <span class="stat-badge" style="background: var(--success-light); color: var(--success); padding: 5px 10px; border-radius: 20px; font-size: 0.9rem;">
                        <i class="fas fa-calendar-day"></i> ${monthlyScaleGroups.reduce((total, group) => total + group.scales.length, 0)} escala${monthlyScaleGroups.reduce((total, group) => total + group.scales.length, 0) === 1 ? '' : 's'}
                    </span>
                </div>
            </div>
            
            <div class="monthly-groups-container">
        `;
        monthlyScaleGroups.sort((a, b) => {
	    const dateA = new Date(a.scales[0].created_at);
	    const dateB = new Date(b.scales[0].created_at);
	    return dateB - dateA; // mais recentes primeiro
	});

        monthlyScaleGroups.forEach((group, index) => {
            const firstScale = group.scales[0];
            const ministry = this.data.ministries.find(m => m.id === parseInt(firstScale.ministry));
            const canEdit = this.canEditScale(firstScale);
      
            //const monthDate = new Date(firstScale.month_reference + '-01');
            const createdAt = group.scales[0].created_at;
            const monthDate = new Date(createdAt);
            const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'long' });
            const year = monthDate.getFullYear();
            
            // Calcular estatísticas do grupo
            const confirmedCount = group.scales.filter(s => s.status === 'confirmed').length;
            const pendingCount = group.scales.filter(s => s.status === 'pending').length;
            
            
            const formattedDate = monthDate.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
            
            console.log(group);


            scalesHtml += `
            <div class="monthly-group-card" data-scale-group="${firstScale.scale_group}">
                <div class="group-card-header">
                    <div class="group-card-icon" style="background: linear-gradient(135deg, #2115b900, #393939);">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                    <div class="group-card-info">
                        <div class="group-card-title">
                            <h3 style="margin: 0 0 5px 0; color: var(--text-primary);">${firstScale.event}</h3>
                            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                                <span class="ministry-badge" style="background: var(--primary); color: white;">${ministry?.name || 'Ministério'}</span>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">
                                    <i class="fas fa-clock"></i> ${firstScale.time}
                                </span>
                                <span style="color: var(--text-secondary); font-size: 0.9rem;">
                                    <i class="fas fa-calendar"></i> ${formattedDate}
                                </span>
                            </div>
                        </div>
                        
                        <div class="group-card-description" style="margin-top: 10px; color: var(--text-secondary); font-size: 0.9rem;">
                            ${firstScale.description || 'Escala mensal programada'}
                        </div>
                    </div>
                    
                    ${canEdit ? `
                    <div class="group-card-actions">
                        <button class="btn btn-outline btn-edit-monthly-group" data-scale-group="${firstScale.scale_group}" title="Editar grupo completo">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
                
                <div class="group-card-content">
                    <div class="group-card-stats" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 15px; margin-bottom: 15px;">
                        <div class="stat-card" style="text-align: center; padding: 10px; background: var(--card-bg); border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--primary);">${group.scales.length}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Datas escaladas</div>
                        </div>
                        
                        <div class="stat-card" style="text-align: center; padding: 10px; background: var(--card-bg); border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--success);">${confirmedCount}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Confirmadas</div>
                        </div>
                        
                        <div class="stat-card" style="text-align: center; padding: 10px; background: var(--card-bg); border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--warning);">${pendingCount}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Pendentes</div>
                        </div>
                        
                        <div class="stat-card" style="text-align: center; padding: 10px; background: var(--card-bg); border-radius: 8px;">
                            <div style="font-size: 1.5rem; font-weight: bold; color: var(--info);">${firstScale.members?.length || 0}</div>
                            <div style="font-size: 0.8rem; color: var(--text-secondary);">Membros</div>
                        </div>
                    </div>
                    
                    <div class="group-card-dates" style="margin-top: 15px;">
                        <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-calendar-day"></i> Datas programadas
                        </h4>
                        <div class="dates-preview" style="display: flex; flex-wrap: wrap; gap: 8px; max-height: 60px; overflow-y: auto; padding: 5px;">
    ${group.scales.slice(0, 6).map(scale => {
        // Usar UTC para evitar problemas de fuso horário
        const scaleDate = new Date(scale.date + 'T00:00:00Z'); // Forçar UTC
        const today = new Date();
        const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
        
        const isPast = scaleDate < todayUTC;
        const isToday = scaleDate.getTime() === todayUTC.getTime();
        
        return `
        <div class="date-preview-item ${isPast ? 'past-date' : ''} ${isToday ? 'today-date' : ''}" 
             data-scale-id="${scale.id}"
             title="${this.formatDate(scale.date)} - ${scale.status === 'confirmed' ? 'Confirmada' : 'Pendente'}"
             style="padding: 4px 8px; background: ${isPast ? 'var(--secondary)' : scale.status === 'confirmed' ? 'var(--success-light)' : 'var(--warning-light)'}; 
                    border-radius: 6px; font-size: 0.8rem; color: ${isPast ? 'var(--text-tertiary)' : 'var(--text-primary)'}; 
                    border: 1px solid ${isPast ? 'var(--border)' : scale.status === 'confirmed' ? 'var(--success)' : 'var(--warning)'};">
            ${scaleDate.getUTCDate().toString().padStart(2, '0')}/${(scaleDate.getUTCMonth() + 1).toString().padStart(2, '0')}
            ${isToday ? '🌟' : ''}
        </div>
        `;
    }).join('')}
    ${group.scales.length > 6 ? `
    <div class="date-preview-item" style="padding: 4px 8px; background: var(--secondary-light); border-radius: 6px; font-size: 0.8rem; color: var(--text-secondary);">
        +${group.scales.length - 6} mais
    </div>
    ` : ''}
</div>
                    </div>
                    
                    <div class="group-card-members" style="margin-top: 15px;">
                        <h4 style="font-size: 0.9rem; color: var(--text-secondary); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-users"></i> Membros escalados
                        </h4>
                        <div class="members-preview" style="display: flex; flex-wrap: wrap; gap: 5px;">
                            ${firstScale.members?.slice(0, 8).map(member => {
                                const user = this.data.users.find(u => u.id === member.id);
                                return user ? `
                                <div class="member-preview" title="${user.name} - ${member.role}" 
                                     style="display: flex; align-items: center; gap: 5px; padding: 3px 8px; background: var(--secondary-lighter); border-radius: 12px; font-size: 0.8rem;">
                                    <div class="member-avatar-small">${this.getInitials(user.name)}</div>
                                    <span style="color: var(--text-primary);">${user.name.split(' ')[0]}</span>
                                </div>
                                ` : '';
                            }).join('')}
                            ${firstScale.members && firstScale.members.length > 8 ? `
                            <div class="member-preview" style="padding: 3px 8px; background: var(--secondary-lighter); border-radius: 12px; font-size: 0.8rem; color: var(--text-secondary);">
                                +${firstScale.members.length - 8}
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                
                <div class="group-card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border);">
                    <div class="group-card-buttons" style="display: flex; gap: 10px;">
                        <button class="btn btn-outline btn-sm btn-view-monthly-group" 
                                data-scale-group="${firstScale.scale_group}"
                                style="font-size: 0.85rem; padding: 6px 12px;">
                            <i class="fas fa-eye"></i> Ver Detalhes
                        </button>
                        
                        ${this.hasPermission('escala_create') ? `
                        <!--<button class="btn btn-outline btn-sm btn-edit-monthly-scale" 
                                data-scale-group="${firstScale.scale_group}"
                                style="font-size: 0.85rem; padding: 6px 12px;"
                                title="Editar escala mensal">
                            <i class="fas fa-edit"></i> Editar Escala</button>-->
                        ` : ''}
                    </div>
                    
                    <div class="group-card-status">
                        <span class="status-badge status-${group.scales.every(s => s.status === 'confirmed') ? 'confirmed' : 'pending'}" 
                              style="font-size: 0.8rem; padding: 3px 8px;">
                            ${group.scales.every(s => s.status === 'confirmed') ? 'Todas confirmadas' : 'Pendente'}
                        </span>
                    </div>
                </div>
                
                ${canEdit ? '<div class="edit-group-overlay">Clique para gerenciar</div>' : ''}
            </div>
            `;
        });
        
        scalesHtml += `
            </div>
            
            ${monthlyScaleGroups.length === 0 ? `
            <div style="text-align: center; padding: 40px 20px; background: var(--card-bg); border-radius: 12px;">
                <i class="fas fa-calendar-plus" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 15px;"></i>
                <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhuma escala mensal</h3>
                <p style="color: var(--text-tertiary); margin-bottom: 20px;">
                    Crie uma escala mensal para programar várias datas de uma vez.
                </p>
                ${this.hasPermission('escala_create') ? `
                <button class="btn btn-primary" id="createFirstMonthlyScale">
                    <i class="fas fa-calendar-alt"></i> Criar Primeira Escala Mensal
                </button>
                ` : ''}
            </div>
            ` : ''}
        </div>
        
        <div class="section-divider" style="margin: 30px 0; text-align: center; position: relative;">
            <div style="border-top: 2px solid var(--border); position: absolute; top: 50%; left: 0; right: 0; z-index: 1;"></div>
            <span style="background: var(--app-bg); padding: 0 20px; position: relative; z-index: 2; color: var(--text-secondary); font-size: 0.9rem;">
                <i class="fas fa-calendar-day"></i> Escalas Individuais
            </span>
        </div>
        `;
    }

    // SECTION 2: ESCALAS INDIVIDUAIS
    if (singleScales.length === 0) {
        scalesHtml += `
        <div class="card" style="border: 2px dashed var(--border);">
            <div class="card-content" style="text-align: center; padding: 40px 20px;">
                <i class="fas fa-calendar-plus" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
                <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhuma escala encontrada</h3>
                <p style="color: var(--text-tertiary); margin-bottom: 20px;">
                    ${this.hasPermission('escala_create') ? 
                      'Comece criando sua primeira escala!' : 
                      'Aguarde ser escalado ou entre em contato com um líder.'}
                </p>
                
                ${this.hasPermission('escala_create') ? `
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button class="btn btn-primary" id="createFirstSingleScale">
                        <i class="fas fa-calendar-day"></i> Nova Escala Única
                    </button>
                    <button class="btn btn-success" id="createFirstMonthlyScaleFromEmpty">
                        <i class="fas fa-calendar-alt"></i> Nova Escala Mensal
                    </button>
                </div>
                ` : ''}
            </div>
        </div>`;
    } else {
        scalesHtml += `
        <div class="scales-grid" style="display: flex; flex-direction: column; gap: 15px;">
        `;
        
        singleScales.forEach((scale, index) => {
            const ministry = this.data.ministries.find(m => m.id === parseInt(scale.ministry));
            const canEdit = this.canEditScale(scale);
            const canView = this.canViewScale(scale);
            
            // Verificar se é escala passada para mostrar indicador visual
            const scaleDate = new Date(scale.date + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isPastScale = scaleDate < today;
            const isTodayScale = scaleDate.toDateString() === today.toDateString();

            // Verificar membros indisponíveis
            const unavailableMembers = [];
            if (scale.members && Array.isArray(scale.members)) {
                scale.members.forEach(member => {
                    const user = this.data.users.find(u => u.id === member.id);
                    if (user && user.unavailability) {
                        const isUnavailable = user.unavailability.some(period => {
                            const startDate = new Date(period.start_date || period.start);
                            const endDate = new Date(period.end_date || period.end);
                            return scaleDate >= startDate && scaleDate <= endDate && period.status === 'approved';
                        });
                        if (isUnavailable) {
                            unavailableMembers.push({
                                name: user.name,
                                reason: 'Indisponível'
                            });
                        }
                    }
                });
            }

            scalesHtml += `
            <div class="card scale-card ${canEdit && !isPastScale ? 'editable' : ''} ${isPastScale ? 'past-scale' : ''} ${isTodayScale ? 'today-scale' : ''}" 
                 data-scale-id="${scale.id}"
                 style="${isTodayScale ? 'border-left: 4px solid var(--primary);' : ''}">
                <div class="card-header">
                    <div class="card-title-container">
                        <div class="card-title">${scale.event}</div>
                        <div class="card-date">
                            <i class="fas fa-calendar"></i> ${this.formatDate(scale.date)}
                            <span class="time-badge">
                                <i class="fas fa-clock"></i> ${scale.time}
                            </span>
                            ${isPastScale ? '<span class="past-badge"><i class="fas fa-history"></i> Realizada</span>' : ''}
                            ${isTodayScale ? '<span class="today-badge"><i class="fas fa-star"></i> Hoje</span>' : ''}
                        </div>
                    </div>
                    
                    <div class="card-actions">
                        ${canEdit && !isPastScale ? `
                        <button class="btn-edit-scale" data-scale-id="${scale.id}" title="Editar Escala">
                            <i class="fas fa-edit"></i>
                        </button>
                        ` : ''}
                        
                        <button class="btn-view-scale" data-scale-id="${scale.id}" title="Ver Detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
                
                <div class="card-content">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <span class="ministry-badge" style="background: ${ministry?.color || 'var(--primary)'};">
                            <i class="fas fa-layer-group"></i> ${ministry?.name || 'Ministério'}
                        </span>
                        
                        <span class="members-count-badge">
                            <i class="fas fa-users"></i> ${scale.members?.length || 0} membro${scale.members?.length === 1 ? '' : 's'}
                        </span>
                        
                        ${unavailableMembers.length > 0 ? `
                        <span class="unavailable-badge" title="${unavailableMembers.length} membro(s) indisponível(is)">
                            <i class="fas fa-user-clock"></i> ${unavailableMembers.length}
                        </span>
                        ` : ''}
                    </div>
                    
                    ${scale.description ? `
                    <div class="scale-description" style="margin-top: 10px; color: var(--text-secondary); font-size: 0.9rem; line-height: 1.4;">
                        ${scale.description}
                    </div>
                    ` : ''}
                </div>
                
                <div class="card-footer">
                    <div class="team-members-preview">
                        ${this.renderScaleMembersPreview(scale.members || [], scale.date)}
                    </div>
                    
                    <div class="status-section">
                        <div class="status-badge status-${scale.status}">
                            ${this.getStatusText(scale.status)}
                        </div>
                        
                        ${scale.songs && scale.songs.length > 0 ? `
                        <div class="songs-badge" title="${scale.songs.length} música(s) na escala">
                            <i class="fas fa-music"></i> ${scale.songs.length}
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                ${canEdit && !isPastScale ? 
                  '<div class="edit-overlay"><i class="fas fa-edit"></i> Clique para editar</div>' : 
                  ''}
                ${isPastScale ? 
                  '<div class="past-overlay"><i class="fas fa-history"></i> Escala já realizada</div>' : 
                  ''}
                ${isTodayScale ? 
                  '<div class="today-overlay"><i class="fas fa-star"></i> Escala de hoje!</div>' : 
                  ''}
            </div>`;
        }); //mikao
        
        scalesHtml += `</div>`;
    }

    console.log('📝 HTML gerado:', scalesHtml);
    scalesList.html(scalesHtml);

    // ========== EVENT LISTENERS ==========
    
    // 1. Criar primeira escala única
    $(document).off('click', '#createFirstSingleScale').on('click', '#createFirstSingleScale', () => {
        this.openScaleModal();
    });
    
    // 2. Criar primeira escala mensal (do empty state)
    //$(document).off('click', '#createFirstMonthlyScale, #createFirstMonthlyScaleFromEmpty').on('click', '#createFirstMonthlyScale, #createFirstMonthlyScaleFromEmpty', () => {
    //    this.showScaleTypeSelection();
    //}); 


       $(document).off('click', '#createFirstMonthlyScaleFromEmpty').on('click', '#createFirstMonthlyScaleFromEmpty', () => {
        this.openMonthlyScaleModal();
    });

    // 3. Ver detalhes de grupo mensal
    $(document).off('click', '.btn-view-monthly-group').on('click', '.btn-view-monthly-group', (e) => {
        e.stopPropagation();
        const scaleGroup = $(e.currentTarget).data('scale-group');
        this.viewMonthlyScaleGroup(scaleGroup);
    });
    
    // 4. Editar grupo mensal (botão específico)
    $(document).off('click', '.btn-edit-monthly-group').on('click', '.btn-edit-monthly-group', (e) => {
        e.stopPropagation();
        const scaleGroup = $(e.currentTarget).data('scale-group');
        this.editMonthlyScaleGroup(scaleGroup);
    });
    
    // 5. Adicionar datas a grupo existente
    $(document).off('click', '.btn-edit-monthly-scale').on('click', '.btn-edit-monthly-scale', (e) => {
    e.stopPropagation();
    const scaleGroup = $(e.currentTarget).data('scale-group');
    this.openEditMonthlyScale(scaleGroup);
});
    
    // 6. Clicar em card de grupo mensal (abre detalhes)
    $(document).off('click', '.monthly-group-card').on('click', '.monthly-group-card', (e) => {
        if (!$(e.target).closest('.btn-view-monthly-group, .btn-edit-monthly-group, .btn-add-to-monthly-group').length) {
            const scaleGroup = $(e.currentTarget).data('scale-group');
            this.viewMonthlyScaleGroup(scaleGroup);
        }
    });
    
    // 7. Clicar em data específica no preview
    $(document).off('click', '.date-preview-item[data-scale-id]').on('click', '.date-preview-item[data-scale-id]', (e) => {
        e.stopPropagation();
        const scaleId = $(e.currentTarget).data('scale-id');
        const scale = this.data.scales.find(s => s.id === scaleId);
        if (scale) {
            if (this.canEditScale(scale)) {
                this.openScaleModal(scaleId);
            } else {
                this.viewScale(scaleId);
            }
        }
    });
    
    // 8. Escalas únicas - Clicar no card para editar/ver
    $(document).off('click', '.scale-card').on('click', '.scale-card', (e) => {
        const scaleId = $(e.currentTarget).data('scale-id');
        const scale = this.data.scales.find(s => s.id === scaleId);
        
        if (!scale) return;
        
        const scaleDate = new Date(scale.date + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isPastScale = scaleDate < today;
        
        // Se clicou em botões específicos, não faz nada aqui
        if ($(e.target).closest('.btn-edit-scale, .btn-view-scale').length) {
            return;
        }
        
        if (this.canEditScale(scale) && !isPastScale) {
            this.openScaleModal(scaleId);
        } else {
            this.viewScale(scaleId);
        }
    });
    
    // 9. Botão editar específico em escala única
    $(document).off('click', '.btn-edit-scale').on('click', '.btn-edit-scale', (e) => {
        e.stopPropagation();
        const scaleId = $(e.currentTarget).data('scale-id');
        const scale = this.data.scales.find(s => s.id === scaleId);
        
        if (scale) {
            const scaleDate = new Date(scale.date + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const isPastScale = scaleDate < today;
            
            if (!isPastScale) {
                this.openSingleScaleModal(scaleId);
            } else {
                this.showToast('Não é possível editar escalas já realizadas', 'error');
            }
        }
    });
    
    // 10. Botão ver detalhes em escala única
    $(document).off('click', '.btn-view-scale').on('click', '.btn-view-scale', (e) => {
        e.stopPropagation();
        const scaleId = $(e.currentTarget).data('scale-id');
        this.viewScale(scaleId);
    });
}

async openEditMonthlyScale(scaleGroup) {
    try {
        this.showLoading('Carregando escala mensal para edição...');
        
        // Buscar detalhes do grupo
        const response = await this.apiCall(`/api/scales/monthly/groups/${scaleGroup}`);
        
        if (response && response.success) {
            this.showEditMonthlyScaleModal(response.data);
        } else {
            this.showToast('Erro ao carregar escala mensal', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao abrir edição de escala mensal:', error);
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

showEditMonthlyScaleModal(groupData) {
    const createdAt = groupData.group_info.created_at;
    const date_s = new Date(createdAt);
    const formattedDate = date_s.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const ministry = this.data.ministries.find(m => m.id == groupData.group_info.ministry_id);
    const isWorshipMinistry = ministry && ministry.name.toLowerCase().includes('louvor');

    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 900px; max-height: 90vh;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-calendar-alt"></i> Editar Escala Mensal
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto;">
                <div class="group-summary">
                    <div class="summary-item">
                        <label>Mês:</label>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="summary-item">
                        <label>Ministério:</label>
                        <span>${groupData.group_info.ministry_name}</span>
                    </div>
                    <div class="summary-item">
                        <label>Evento:</label>
                        <span>${groupData.group_info.event}</span>
                    </div>
                    <div class="summary-item">
                        <label>Hora:</label>
                        <span>${groupData.group_info.time}</span>
                    </div>
                    <div class="summary-item">
                        <label>Datas existentes:</label>
                        <span>${groupData.scales.length} escala(s)</span>
                    </div>
                </div>
                
                <!-- OPÇÕES DE AÇÃO -->
                <div class="edit-options" style="margin-top: 30px; padding: 20px; background: var(--card-bg); border-radius: 12px;">
                    <h4 style="color: var(--primary); margin-bottom: 20px;">
                        <i class="fas fa-cogs"></i> O que você gostaria de fazer?
                    </h4>
                    
                    <div class="action-cards" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
                        <!-- Opção 1: Gerenciar Datas Existentes -->
                        <div class="action-card" id="manageExistingDates">
                            <div class="action-icon" style="background: var(--primary-light); color: var(--primary);">
                                <i class="fas fa-calendar-day"></i>
                            </div>
                            <div class="action-content">
                                <h5>Gerenciar Datas Existentes</h5>
                                <p>Editar membros, músicas ou horários das escalas já criadas.</p>
                                <ul style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px;">
                                    <li><i class="fas fa-check"></i> Editar escalas individuais</li>
                                    <li><i class="fas fa-check"></i> Alterar membros por data</li>
                                    <li><i class="fas fa-check"></i> Modificar músicas</li>
                                    <li><i class="fas fa-check"></i> Ajustar horários</li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Opção 2: Adicionar Novas Datas -->
                        <div class="action-card" id="addNewDates">
                            <div class="action-icon" style="background: var(--success-light); color: var(--success);">
                                <i class="fas fa-plus-circle"></i>
                            </div>
                            <div class="action-content">
                                <h5>Adicionar Novas Datas</h5>
                                <p>Incluir mais datas neste grupo de escala mensal.</p>
                                <ul style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px;">
                                    <li><i class="fas fa-check"></i> Selecionar novas datas</li>
                                    <li><i class="fas fa-check"></i> Copiar configuração existente</li>
                                    <li><i class="fas fa-check"></i> Adicionar rapidamente</li>
                                </ul>
                            </div>
                        </div>
                        
                        <!-- Opção 3: Reconfigurar Grupo Completo -->
                        <div class="action-card" id="reconfigureGroup">
                            <div class="action-icon" style="background: var(--warning-light); color: var(--warning);">
                                <i class="fas fa-sync-alt"></i>
                            </div>
                            <div class="action-content">
                                <h5>Reconfigurar Grupo</h5>
                                <p>Alterar configurações gerais do grupo (evento, hora, membros padrão).</p>
                                <ul style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 10px;">
                                    <li><i class="fas fa-check"></i> Alterar nome do evento</li>
                                    <li><i class="fas fa-check"></i> Modificar horário padrão</li>
                                    <li><i class="fas fa-check"></i> Trocar membros base</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <!-- AÇÕES RÁPIDAS -->
                    <div class="quick-actions" style="margin-top: 25px; padding-top: 20px; border-top: 1px solid var(--border);">
                        <h5 style="color: var(--text-secondary); margin-bottom: 15px;">
                            <i class="fas fa-bolt"></i> Ações Rápidas
                        </h5>
                        <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                            <button class="btn btn-outline btn-sm" id="viewAllScalesBtn">
                                <i class="fas fa-eye"></i> Ver Todas as Escalas
                            </button>
                            <button class="btn btn-outline btn-sm" id="exportScalesBtn">
                                <i class="fas fa-download"></i> Exportar para Excel
                            </button>
                            <button class="btn btn-outline btn-sm btn-danger" id="deleteGroupBtn">
                                <i class="fas fa-trash"></i> Excluir Grupo
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- LISTA DE ESCALAS EXISTENTES -->
                <div class="existing-scales" style="margin-top: 30px;">
                    <h4 style="color: var(--primary); margin-bottom: 15px;">
                        <i class="fas fa-list"></i> Escalas do Mês (${groupData.scales.length})
                    </h4>
                    
                    <div class="scales-table-container" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 8px;">
                        <table class="scales-table" style="width: 100%; border-collapse: collapse;">
                            <thead style="background: var(--card-bg); position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Data</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Status</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Membros</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Músicas</th>
                                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid var(--border);">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${groupData.scales.map(scale => {
                                    const scaleDate = new Date(scale.date);
                                    const formattedScaleDate = this.formatDate(scale.date);
                                    const membersCount = scale.members?.length || 0;
                                    const songsCount = (scale.songs && Array.isArray(scale.songs)) ? scale.songs.length : 0;
                                    
                                    return `
                                    <tr>
                                        <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                            <div style="font-weight: 500;">${formattedScaleDate}</div>
                                            <div style="font-size: 0.85rem; color: var(--text-secondary);">
                                                ${scaleDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
                                            </div>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                            <span class="status-badge status-${scale.status}" style="font-size: 0.8rem;">
                                                ${this.getStatusText(scale.status)}
                                            </span>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                            <div style="display: flex; align-items: center; gap: 5px;">
                                                <i class="fas fa-users" style="color: var(--text-secondary);"></i>
                                                <span>${membersCount}</span>
                                            </div>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                            <div style="display: flex; align-items: center; gap: 5px;">
                                                <i class="fas fa-music" style="color: var(--text-secondary);"></i>
                                                <span>${songsCount}</span>
                                            </div>
                                        </td>
                                        <td style="padding: 12px; border-bottom: 1px solid var(--border);">
                                            <div style="display: flex; gap: 5px;">
                                                <button class="btn btn-sm btn-outline btn-edit-scale" data-scale-id="${scale.id}" title="Editar esta escala">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="btn btn-sm btn-outline btn-view-scale" data-scale-id="${scale.id}" title="Ver detalhes">
                                                    <i class="fas fa-eye"></i>
                                                </button>
                                                ${scale.status !== 'cancelled' ? `
                                                <button class="btn btn-sm btn-outline btn-cancel-scale" data-scale-id="${scale.id}" title="Cancelar">
                                                    <i class="fas fa-times"></i>
                                                </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
            
            <div class="modal-actions" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
                <button class="btn btn-secondary btn-close-modal">Fechar</button>
                <button class="btn btn-primary" id="addMoreDatesBtn">
                    <i class="fas fa-plus"></i> Adicionar Mais Datas
                </button>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Estilos CSS para as opções
    $('<style>')
        .text(`
            .action-card {
                padding: 20px;
                border: 2px solid var(--border);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                height: 100%;
                display: flex;
                flex-direction: column;
                gap: 15px;
            }
            .action-card:hover {
                border-color: var(--primary);
                transform: translateY(-5px);
                box-shadow: 0 8px 20px rgba(0,0,0,0.1);
            }
            .action-card .action-icon {
                width: 60px;
                height: 60px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
            }
            .action-card .action-content h5 {
                margin: 0 0 10px 0;
                color: var(--text-primary);
                font-size: 1.1rem;
            }
            .action-card .action-content p {
                margin: 0;
                color: var(--text-secondary);
                font-size: 0.9rem;
                line-height: 1.4;
            }
            .action-card .action-content ul {
                margin: 10px 0 0 0;
                padding-left: 20px;
            }
            .action-card .action-content ul li {
                margin-bottom: 5px;
            }
            .scales-table-container::-webkit-scrollbar {
                width: 8px;
            }
            .scales-table-container::-webkit-scrollbar-track {
                background: var(--secondary-lighter);
                border-radius: 4px;
            }
            .scales-table-container::-webkit-scrollbar-thumb {
                background: var(--border);
                border-radius: 4px;
            }
        `)
        .appendTo('head');
    
    // Event listeners para as opções
    modal.find('#manageExistingDates').click(() => {
        // Leva para a tela de gerenciamento de escalas existentes
        this.showManageExistingDates(groupData);
        modal.remove();
    });
    
    modal.find('#addNewDates').click(() => {
        modal.remove();
        this.addDatesToMonthlyGroup(groupData);
    });
    
    modal.find('#reconfigureGroup').click(() => {
        modal.remove();
        this.reconfigureMonthlyGroup(groupData);
    });
    
    // Ações rápidas
    modal.find('#viewAllScalesBtn').click(() => {
        modal.remove();
        this.viewMonthlyScaleGroup(groupData.group_info.scale_group);
    });
    
    modal.find('#addMoreDatesBtn').click(() => {
        modal.remove();
        this.addDatesToMonthlyGroup(groupData);
    });
    
    modal.find('#deleteGroupBtn').click(() => {
        if (confirm(`ATENÇÃO: Esta ação irá excluir TODAS as ${groupData.scales.length} escalas deste grupo.\n\nTem certeza que deseja continuar?`)) {
            this.deleteMonthlyScaleGroup(groupData.group_info.scale_group);
            modal.remove();
        }
    });
    
    // Editar escala individual
    modal.find('.btn-edit-scale').click(function() {
        const scaleId = $(this).data('scale-id');
        modal.remove();
        churchTimeApp.openSingleScaleModal(scaleId);
    });
    
    // Ver escala individual
    modal.find('.btn-view-scale').click(function() {
        const scaleId = $(this).data('scale-id');
        modal.remove();
        churchTimeApp.viewScale(scaleId);
    });
    
    // Cancelar escala individual
    modal.find('.btn-cancel-scale').click(function() {
        const scaleId = $(this).data('scale-id');
        if (confirm('Tem certeza que deseja cancelar esta escala?')) {
            churchTimeApp.cancelScale(scaleId);
            modal.remove();
        }
    });
    
    // Fechar modal
    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

async showManageExistingDates(groupData) {
    // Implemente uma interface para gerenciar escalas existentes
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 1000px; max-height: 90vh;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-calendar-edit"></i> Gerenciar Escalas Existentes
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto;">
                <div class="management-interface">
                    <!-- Interface para editar em lote -->
                    <p>Implemente aqui a interface para editar múltiplas escalas de uma vez</p>
                </div>
            </div>
        </div>
    </div>`);
    
    modal.appendTo('body');
    // Implemente a lógica de edição em lote aqui
}

async reconfigureMonthlyGroup(groupData) {
    // Implemente a reconfiguração do grupo completo
    this.showToast('Funcionalidade em desenvolvimento', 'info');
}

async deleteMonthlyScaleGroup(scaleGroup) {
    try {
        this.showLoading('Excluindo grupo de escalas...');
        
        const response = await this.apiCall(`/api/scales/monthly/groups/${scaleGroup}`, 'DELETE');
        
        if (response && response.success) {
            this.showToast('Grupo de escalas excluído com sucesso!');
            await this.loadDataFromAPI();
            this.loadDashboard();
        } else {
            this.showToast(response?.error || 'Erro ao excluir grupo', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao excluir grupo:', error);
        this.showToast('Erro ao excluir grupo', 'error');
    } finally {
        this.hideLoading();
    }
}

async cancelScale(scaleId) {
    try {
        this.showLoading('Cancelando escala...');
        
        const response = await this.apiCall('/scales/cancel', 'PUT', {
            id: scaleId,
            status: 'cancelled'
        });
        
        if (response && response.success) {
            this.showToast('Escala cancelada com sucesso!');
            await this.loadDataFromAPI();
            
            // Se estiver na dashboard, recarregar
            if (this.state.currentNav === 'home') {
                this.loadDashboard();
            }
        } else {
            this.showToast(response?.error || 'Erro ao cancelar escala', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao cancelar escala:', error);
        this.showToast('Erro ao cancelar escala', 'error');
    } finally {
        this.hideLoading();
    }
}

// Método para agrupar escalas mensais
groupMonthlyScales(scales) {
    const groups = {};
    
    scales.forEach(scale => {
        if (scale.scale_group && scale.scale_type === 'monthly_group') {
            if (!groups[scale.scale_group]) {
                groups[scale.scale_group] = {
                    scale_group: scale.scale_group,
                    scales: []
                };
            }
            groups[scale.scale_group].scales.push(scale);
        }
    });
    
    // Converter para array e ordenar por data (mais recente primeiro)
    return Object.values(groups)
        .map(group => {
            // Ordenar escalas do grupo por data (mais próxima primeiro)
            group.scales.sort((a, b) => new Date(a.date) - new Date(b.date));
            return group;
        })
        .sort((a, b) => {
            // Ordenar grupos pela data da primeira escala (mais recente primeiro)
            const dateA = new Date(a.scales[0].date);
            const dateB = new Date(b.scales[0].date);
            return dateB - dateA;
        });
}

// Método para renderizar preview dos membros
renderScaleMembersPreview(members, scaleDate) {
    let html = '<div class="members-avatars-container">';
    let count = 0;
    let unavailableCount = 0;
    
    members.forEach(member => {
        const user = this.data.users.find(u => u.id === member.id);
        if (user && count < 6) {
            const unavailable = this.isUserUnavailable(user, scaleDate);
            const statusClass = unavailable ? 'unavailable' : '';
            const statusTitle = unavailable ? 'INDISPONÍVEL' : '';
            
            html += `
            <div class="member-avatar-preview ${statusClass}" 
                 title="${user.name} (${member.role})${statusTitle ? ' - ' + statusTitle : ''}"
                 data-user-id="${user.id}">
                <div class="avatar-initials">${this.getInitials(user.name)}</div>
                ${unavailable ? '<div class="unavailable-dot"></div>' : ''}
            </div>`;
            
            count++;
            if (unavailable) unavailableCount++;
        }
    });
    
    if (members.length > 6) {
        html += `
        <div class="more-members-count" title="Mais ${members.length - 6} membro(s)">
            +${members.length - 6}
            ${unavailableCount > 0 ? `<div class="unavailable-count">${unavailableCount}</div>` : ''}
        </div>`;
    }
    
    html += '</div>';
    
    return html;
}

// Método para ver grupo mensal
async viewMonthlyScaleGroup(scaleGroup) {
    try {
        this.showLoading('Carregando escala mensal...');
        
        const response = await this.apiCall(`/api/scales/monthly/groups/${scaleGroup}`);
        
        if (response && response.success) {
            this.showMonthlyScaleGroupModal(response.data);
        } else {
            this.showToast('Erro ao carregar escala mensal', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

showMonthlyScaleGroupModal(groupData) {
    const createdAt = groupData.group_info.created_at;
    const date_s = new Date(createdAt);
    const formattedDate = date_s.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });

    const ministry = this.data.ministries.find(m => m.id == groupData.group_info.ministry_id);
    const isWorshipMinistry = ministry && ministry.name.toLowerCase().includes('louvor');

    // Função para buscar detalhes das músicas de uma escala
    const getScaleSongsDetails = (scale) => {
        const songIds = scale.songs || [];
        return songIds.map(songId => {
            const song = this.data.songs.find(s => s.id === songId);
            return song ? {
                id: song.id,
                title: song.title,
                artist: song.artist,
                hasLyrics: song.lyrics && song.lyrics.trim() !== '',
                hasChords: song.chords && song.chords.trim() !== '',
                hasYouTube: song.youtubeId && song.youtubeId.trim() !== ''
            } : null;
        }).filter(song => song);
    };

    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 800px; max-height: 90vh;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-calendar-alt"></i> ${groupData.group_info.event}
                    ${isWorshipMinistry ? '<span style="margin-left: 10px; color: var(--accent);"><i class="fas fa-music"></i> Louvor</span>' : ''}
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="overflow-y: auto;">
                <div class="group-summary">
                    <div class="summary-item">
                        <label>Mês:</label>
                        <span>${formattedDate}</span>
                    </div>
                    <div class="summary-item">
                        <label>Ministério:</label>
                        <span>${groupData.group_info.ministry_name}</span>
                    </div>
                    <div class="summary-item">
                        <label>Hora:</label>
                        <span>${groupData.group_info.time}</span>
                    </div>
                    <div class="summary-item">
                        <label>Total de escalas:</label>
                        <span>${groupData.statistics.total} data${groupData.statistics.total === 1 ? '' : 's'}</span>
                    </div>
                </div>
                
                <!-- SEÇÃO DE MÚSICAS DO GRUPO (APENAS LOUVOR) -->
                ${isWorshipMinistry ? `
                <div class="group-music-overview" style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                    <h4 style="color: var(--primary); margin-bottom: 15px;">
                        <i class="fas fa-music"></i> Repertório do Mês
                        ${groupData.group_info.music_key ? `
                        <span class="music-key-badge" style="margin-left: 10px; background: var(--accent); color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem;">
                            <i class="fas fa-guitar"></i> Tom: ${groupData.group_info.music_key}
                        </span>
                        ` : ''}
                    </h4>
                    
                    <!-- Lista de todas as músicas únicas do mês -->
                    <div id="monthSongsList" style="margin-bottom: 15px;">
                        <div style="text-align: center; padding: 10px; color: var(--text-tertiary);">
                            <i class="fas fa-sync-alt fa-spin"></i> Carregando músicas do mês...
                        </div>
                    </div>
                </div>
                ` : ''}
                
                <div class="scales-calendar" style="margin-top: 20px;">
                    <h4>Escalas do Mês</h4>
                   <div class="scales-grid">
    ${groupData.scales.map(scale => {
        // Usar UTC para evitar problemas de fuso horário
        const scaleDate = new Date(scale.date + 'T00:00:00Z'); // Forçar UTC
        const scaleSongs = getScaleSongsDetails(scale);
        const hasMusic = scaleSongs.length > 0;
        
        return `
        <div class="scale-date-item ${scale.status === 'confirmed' ? 'confirmed' : ''}" 
             data-scale-id="${scale.id}">
            <div class="date-header">
                <div class="date-day">${scaleDate.getUTCDate()}</div>
                <div class="date-weekday">${scaleDate.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })}</div>
            </div>
            <div class="date-status status-${scale.status}">
                ${this.getStatusText(scale.status)}
            </div>
            ${hasMusic ? `
            <div class="date-music-badge" title="${scaleSongs.length} música(s)">
                <i class="fas fa-music"></i> ${scaleSongs.length}
            </div>
            ` : ''}
            ${scale.members.length > 0 ? `
            <div class="date-members">
                <small>${scale.members.length} membro${scale.members.length === 1 ? '' : 's'}</small>
            </div>
            ` : ''}
        </div>
        `;
    }).join('')}
</div>
                </div>
                
                <div class="members-list" style="margin-top: 25px;">
                    <h4>Membros Escalados</h4>
                    <div class="members-grid">
                        ${groupData.group_info.members.map(member => {
                            const user = this.data.users.find(u => u.id === member.id);
                            return user ? `
                            <div class="member-item">
                                <div class="member-avatar">${this.getInitials(user.name)}</div>
                                <div class="member-info">
                                    <div class="member-name">${user.name}</div>
                                    <div class="member-role">${member.role || 'Participante'}</div>
                                </div>
                            </div>
                            ` : '';
                        }).join('')}
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary btn-close-modal">Fechar</button>
                    ${this.canEditScale(groupData.scales[0]) ? `
                    
                    ` : ''}
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Carregar músicas do mês (após o modal estar no DOM)
    if (isWorshipMinistry) {
        setTimeout(() => {
            this.loadMonthSongsForGroup(modal, groupData);
        }, 100);
    }
    
    // Event listener para clicar em uma escala do mês
    modal.find('.scale-date-item[data-scale-id]').click(function() {
        const scaleId = $(this).data('scale-id');
        const scale = groupData.scales.find(s => s.id === scaleId);
        if (scale) {
            modal.remove();
            churchTimeApp.viewScale(scaleId);
        }
    });
    
    modal.find('.btn-edit-monthly-group').click(() => {
        modal.remove();
        this.editMonthlyScaleGroup(groupData.group_info.scale_group);
    });
    
    modal.find('.modal-close, .btn-close-modal').click(() => modal.remove());
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

async fetchSongDetails(songId) {
    try {
        console.log('🔍 Buscando detalhes da música:', songId);
        
        const response = await this.apiCall(`/songs/${songId}`);
        
        if (response && response.success) {
            console.log('✅ Detalhes da música encontrados:', {
                id: songId,
                youtubeId: response.data.song.youtubeId
            });
            return response.data.song;
        } else {
            console.warn('⚠️ Não foi possível buscar detalhes da música:', songId);
            return null;
        }
    } catch (error) {
        console.error('❌ Erro ao buscar detalhes da música:', error);
        return null;
    }
}

async loadMonthSongsForGroup(modal, groupData) {
    const container = modal.find('#monthSongsList');
    
    try {
        // Coletar todas as músicas únicas de todas as escalas do mês
        const allSongs = new Map(); // Usar Map para evitar duplicatas
        
        // Primeiro, coletar todos os IDs únicos
        const uniqueSongIds = new Set();
        
        groupData.scales.forEach(scale => {
            let scaleSongs = [];
            
            if (Array.isArray(scale.songs)) {
                scaleSongs = scale.songs;
            } else if (scale.songs && typeof scale.songs === 'string') {
                try {
                    scaleSongs = JSON.parse(scale.songs);
                } catch (e) {
                    console.warn('Erro ao parsear songs JSON:', e);
                }
            }
            
            // Adicionar IDs únicos
            if (Array.isArray(scaleSongs) && scaleSongs.length > 0) {
                scaleSongs.forEach(songItem => {
                    const songId = songItem.id || songItem;
                    if (songId) uniqueSongIds.add(songId);
                });
            }
        });
        
        console.log('🎵 IDs de músicas únicos encontrados:', Array.from(uniqueSongIds));
        
        // Buscar detalhes de cada música em paralelo
        const songPromises = Array.from(uniqueSongIds).map(async (songId) => {
            try {
                // PRIMEIRO: Tentar encontrar nos dados locais (cache)
                const localSong = this.data.songs.find(s => s.id === songId);
                
                if (localSong && localSong.youtubeId) {
                    console.log('✅ Música encontrada no cache local:', songId);
                    return {
                        id: localSong.id,
                        title: localSong.title,
                        artist: localSong.artist,
                        youtubeId: localSong.youtubeId,
                        hasLyrics: localSong.lyrics && localSong.lyrics.trim() !== '',
                        hasChords: localSong.chords && localSong.chords.trim() !== '',
                        usedInDates: []
                    };
                }
                
                // SEGUNDO: Buscar da API se não encontrou no cache ou não tem youtubeId
                const songDetails = await this.fetchSongDetails(songId);
                
                if (songDetails) {
                    // Atualizar cache local
                    const existingIndex = this.data.songs.findIndex(s => s.id === songId);
                    if (existingIndex !== -1) {
                        // Atualizar dados existentes
                        this.data.songs[existingIndex] = {
                            ...this.data.songs[existingIndex],
                            ...songDetails
                        };
                    } else {
                        // Adicionar nova música ao cache
                        this.data.songs.push(songDetails);
                    }
                    
                    return {
                        id: songDetails.id,
                        title: songDetails.title,
                        artist: songDetails.artist,
                        youtubeId: songDetails.youtubeId,
                        hasLyrics: songDetails.lyrics && songDetails.lyrics.trim() !== '',
                        hasChords: songDetails.chords && songDetails.chords.trim() !== '',
                        usedInDates: []
                    };
                }
                
                return null;
            } catch (error) {
                console.error(`❌ Erro ao buscar música ${songId}:`, error);
                return null;
            }
        });
        
        // Aguardar todas as buscas
        const songsData = await Promise.all(songPromises);
        
        // Filtrar resultados nulos e adicionar ao Map
        songsData.filter(song => song !== null).forEach(song => {
            if (song && song.id) {
                allSongs.set(song.id, song);
            }
        });
        
        // Mapear datas de uso
        groupData.scales.forEach(scale => {
            let scaleSongs = [];
            
            if (Array.isArray(scale.songs)) {
                scaleSongs = scale.songs;
            } else if (scale.songs && typeof scale.songs === 'string') {
                try {
                    scaleSongs = JSON.parse(scale.songs);
                } catch (e) {
                    console.warn('Erro ao parsear songs JSON:', e);
                }
            }
            
            if (Array.isArray(scaleSongs) && scaleSongs.length > 0) {
                scaleSongs.forEach(songItem => {
                    const songId = songItem.id || songItem;
                    const songData = allSongs.get(songId);
                    
                    if (songData) {
                        songData.usedInDates.push(scale.date);
                    }
                });
            }
        });
        
        const songsArray = Array.from(allSongs.values());
        
        console.log('🎵 Músicas processadas para o mês:', songsArray.length);
        console.log('📊 Detalhes:', songsArray.map(s => ({
            id: s.id,
            title: s.title,
            youtubeId: s.youtubeId ? `${s.youtubeId.substring(0, 10)}...` : 'SEM YOUTUBE'
        })));
        
        // Resto do código permanece o mesmo...
        if (songsArray.length === 0) {
            container.html(`
                <div style="text-align: center; padding: 20px; color: var(--text-tertiary);">
                    <i class="fas fa-music"></i>
                    <p>Nenhuma música cadastrada para este mês</p>
                </div>
            `);
            return;
        }
        
        // Agrupar por frequência de uso
        songsArray.sort((a, b) => b.usedInDates.length - a.usedInDates.length);
        
        let html = `
        <div class="month-songs-stats" style="margin-bottom: 15px; padding: 10px; background: var(--card-bg); border-radius: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span><strong>${songsArray.length}</strong> música(s) diferentes</span>
                <span><strong>${songsArray.reduce((total, song) => total + song.usedInDates.length, 0)}</strong> execução(ões) no mês</span>
            </div>
        </div>
        
        <div class="month-songs-list">`;
        
        songsArray.forEach((song, index) => {
            html += `
            <div class="month-song-item" data-song-id="${song.id}">
                <div class="song-ranking">#${index + 1}</div>
                <div class="song-details">
                    <div class="song-title">${song.title}</div>
                    <div class="song-artist">${song.artist}</div>
                    <div class="song-usage">
                        <small style="color: var(--text-secondary);">
                            <i class="fas fa-calendar"></i> Usada em ${song.usedInDates.length} data(s)
                        </small>
                        <div class="song-dates" style="margin-top: 5px;">
                            ${song.usedInDates.map(date => {
                                const dateObj = new Date(date);
                                return `<span class="date-chip">${dateObj.getUTCDate()}/${dateObj.getUTCMonth() + 1}</span>`;
                            }).join('')}
                        </div>
                    </div>
                </div>
                <div class="song-actions">
                    ${song.youtubeId ? `
                    <button class="btn btn-sm btn-outline btn-preview" 
                            data-song-id="${song.id}"
                            data-youtube="${song.youtubeId}"
                            title="Prévia">
                        <i class="fas fa-play"></i>
                    </button>
                    ` : ''}
                    ${(song.hasLyrics || song.hasChords) ? `
                    <button class="btn btn-sm btn-outline btn-view" 
                            data-song-id="${song.id}"
                            title="Ver Letra/Cifra">
                        <i class="fas fa-eye"></i>
                    </button>
                    ` : ''}
                </div>
            </div>`;
        });
        
        html += '</div>';
        container.html(html);
        
        // Event listeners - CORRIGIDO
        modal.off('click', '.btn-preview').on('click', '.btn-preview', function() {
            const songId = $(this).data('song-id');
            const youtubeId = $(this).data('youtube');
            
            console.log('🎵 Preview clicado - Dados:', {
                songId,
                youtubeId,
                temYoutubeId: !!youtubeId
            });
            
            // Verificar se temos o youtubeId
            if (!youtubeId) {
                churchTimeApp.showToast('Esta música não tem vídeo do YouTube', 'warning');
                return;
            }
            
            churchTimeApp.showMusicPreview(songId, youtubeId);
        });
        
        modal.off('click', '.btn-view').on('click', '.btn-view', function() {
            const songId = $(this).data('song-id');
            churchTimeApp.showLyricsAndChords(songId);
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar músicas do mês:', error);
        container.html(`
            <div style="text-align: center; padding: 20px; color: var(--danger);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao carregar músicas: ${error.message}</p>
            </div>
        `);
    }
}

// EDIT WIZARD SCALES FUNCTIONS // BEGIN
async editMonthlyScaleGroup(scaleGroup) {
    try {
        this.showLoading('Carregando grupo para edição...');
        console.log('✏️ Editando escala mensal, grupo:', scaleGroup);
        
        // Usar rota específica para edição
        const response = await this.apiCall(`/api/scales/monthly/groups/${scaleGroup}/edit`);
        console.log('📥 Resposta da API para edição:', response);
        
        if (response && response.success) {
            // Abrir modal em modo de edição
            await this.showEditMonthlyScaleGroupModal(response.data);
        } else {
            const errorMsg = response?.error || 'Erro desconhecido';
            console.error('❌ Erro ao carregar grupo:', errorMsg);
            this.showToast(`Erro ao carregar grupo: ${errorMsg}`, 'error');
        }
    } catch (error) {
        console.error('💥 Erro ao editar grupo:', error);
        this.showToast('Erro de conexão ao carregar dados', 'error');
    } finally {
        this.hideLoading();
    }
}


async showEditMonthlyScaleGroupModal(groupData) {
    console.log('🔍 Dados recebidos para edição:', groupData);
    
    try {
        // Verificar dados mínimos
        if (!groupData || !groupData.scale_group) {
            console.error('❌ Dados inválidos recebidos');
            this.showToast('Dados da escala inválidos', 'error');
            return;
        }
        
        // Obter nome do ministério
        const ministry = this.data.ministries.find(m => m.id == groupData.ministry_id);
        const ministryName = ministry ? ministry.name : 'Ministério não encontrado';
        
        // Formatar data
        const formattedMonth = this.formatMonthYear(groupData.month_reference);
        
        const modal = $(`
        <div class="modal" id="editMonthlyScaleModal">
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">
                        <i class="fas fa-edit"></i> Editar Escala Mensal
                    </h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="wizard-steps">
                        <div class="wizard-step active" data-step="1">
                            <span class="step-number">1</span>
                            <span class="step-label">Mês e Ministério</span>
                        </div>
                        <div class="wizard-step" data-step="2">
                            <span class="step-number">2</span>
                            <span class="step-label">Selecionar Datas</span>
                        </div>
                        <div class="wizard-step" data-step="3">
                            <span class="step-number">3</span>
                            <span class="step-label">Membros e Detalhes</span>
                        </div>
                        <div class="wizard-step" data-step="4">
                            <span class="step-number">4</span>
                            <span class="step-label">Revisar e Salvar</span>
                        </div>
                    </div>
                    
                    <div class="wizard-content">
                        <!-- PASSO 1 - MÊS E MINISTÉRIO (BLOQUEADO) -->
                        <div class="wizard-step-content active" data-step="1">
                            <div class="edit-mode-notice" style="margin-bottom: 20px; padding: 15px; background: var(--info-light); border-radius: 8px; border-left: 4px solid var(--info);">
                                <i class="fas fa-info-circle" style="color: var(--info);"></i>
                                <strong>Modo edição:</strong> Alguns campos não podem ser alterados
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Mês e Ano *</label>
                                <input type="month" class="form-input" id="monthlyScaleMonth" 
                                       value="${groupData.month_reference}" readonly
                                       style="background-color: var(--secondary); cursor: not-allowed;">
                                <small class="form-hint">Não pode ser alterado em modo de edição</small>
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Ministério *</label>
                                <select class="form-select" id="monthlyScaleMinistry" disabled
                                        style="background-color: var(--secondary); cursor: not-allowed;">
                                    <option value="${groupData.ministry_id}" selected>
                                        ${ministryName}
                                    </option>
                                </select>
                                <small class="form-hint">Não pode ser alterado em modo de edição</small>
                            </div>
                            
                            <div class="step-actions">
                                <button class="btn btn-secondary" id="cancelMonthlyScale">
                                    <i class="fas fa-times"></i> Cancelar
                                </button>
                                <button class="btn btn-primary btn-next-step" data-next="2">
                                    <i class="fas fa-arrow-right"></i> Próximo
                                </button>
                            </div>
                        </div>
                        
                       <!-- PASSO 2 - DATAS (BLOQUEADO - RESPONSIVO) -->
<div class="wizard-step-content" data-step="2">
    <div class="edit-mode-notice responsive-notice">
        <i class="fas fa-calendar-alt"></i>
        <div class="notice-content">
            <strong>Datas da escala:</strong> ${groupData.dates?.length || 0} data(s) escalada(s)
        </div>
    </div>
    
    <div class="locked-dates-container">
        <div class="locked-dates-card">
            <div class="lock-icon-large">
                <i class="fas fa-lock"></i>
            </div>
            
            <h4 class="locked-title">
                Datas Bloqueadas para Edição
            </h4>
            
            <p class="locked-description">
                <i class="fas fa-info-circle"></i> As datas não podem ser alteradas em modo de edição. 
                Para mudar as datas, você deve criar uma nova escala.
            </p>
            
            <!-- Lista de datas existentes -->
            <div class="existing-dates-section">
                <h5 class="dates-section-title">
                    <i class="fas fa-calendar-check"></i> 
                    <span class="title-text">Datas desta escala:</span>
                    <span class="dates-count">(${groupData.dates?.length || 0})</span>
                </h5>
                
                <div class="dates-grid">
                    ${groupData.dates && groupData.dates.length > 0 ? 
                        groupData.dates.sort().map(date => {
                            try {
                                const [y, m, d] = date.split('-');
                                const day = parseInt(d);
                                const month = parseInt(m);
                                const dateObj = new Date(y, m - 1, d);
                                const weekday = this.capitalizeFirstLetter(dateObj.toLocaleDateString('pt-BR', { weekday: 'short' }));
                                const formattedDate = `${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${y}`;
                                
                                return `
                                <div class="date-display-card">
                                    <div class="date-main-info">
                                        <div class="date-number">${day}/${month}</div>
                                        <div class="date-weekday">${weekday}</div>
                                    </div>
                                    <div class="date-year">${y}</div>
                                    <div class="date-lock-indicator">
                                        <i class="fas fa-lock"></i> travada
                                    </div>
                                </div>`;
                            } catch (error) {
                                return '';
                            }
                        }).join('') : 
                        '<div class="no-dates-message">Nenhuma data encontrada</div>'
                    }
                </div>
            </div>
            
            <!-- Resumo estatístico -->
            <div class="dates-summary">
                <div class="summary-grid">
                    <div class="summary-item">
                        <div class="summary-value" data-value="${groupData.dates?.length || 0}">
                            ${groupData.dates?.length || 0}
                        </div>
                        <div class="summary-label">
                            <i class="fas fa-calendar-day"></i> Data(s)
                        </div>
                    </div>
                    
                    <div class="summary-item">
                        <div class="summary-value" data-value="${(() => {
                            // Calcular total de membros únicos
                            const uniqueMembers = new Set();
                            const selections = groupData.selections || {};
                            Object.values(selections).forEach(dateData => {
                                if (dateData.members) {
                                    Object.keys(dateData.members).forEach(memberId => {
                                        uniqueMembers.add(memberId);
                                    });
                                }
                            });
                            return uniqueMembers.size;
                        })()}">
                            ${(() => {
                                const uniqueMembers = new Set();
                                const selections = groupData.selections || {};
                                Object.values(selections).forEach(dateData => {
                                    if (dateData.members) {
                                        Object.keys(dateData.members).forEach(memberId => {
                                            uniqueMembers.add(memberId);
                                        });
                                    }
                                });
                                return uniqueMembers.size;
                            })()}
                        </div>
                        <div class="summary-label">
                            <i class="fas fa-users"></i> Membro(s)
                        </div>
                    </div>
                    
                    ${(() => {
                        // Verificar se é ministério de louvor
                        const ministryId = groupData.ministry_id;
                        const ministry = this.data.ministries.find(m => m.id == ministryId);
                        if (ministry) {
                            const worshipKeywords = ['louvor', 'música', 'worship', 'canto', 'banda', 'coral', 'musica'];
                            const ministryName = ministry.name.toLowerCase();
                            const isWorship = worshipKeywords.some(keyword => ministryName.includes(keyword));
                            
                            if (isWorship) {
                                // Calcular total de músicas
                                let totalSongs = 0;
                                const selections = groupData.selections || {};
                                Object.values(selections).forEach(dateData => {
                                    if (dateData.songs) {
                                        totalSongs += dateData.songs.length;
                                    }
                                });
                                
                                return `
                                <div class="summary-item">
                                    <div class="summary-value" data-value="${totalSongs}">
                                        ${totalSongs}
                                    </div>
                                    <div class="summary-label">
                                        <i class="fas fa-music"></i> Música(s)
                                    </div>
                                </div>`;
                            }
                        }
                        return '';
                    })()}
                </div>
            </div>
            
            <!-- Instruções -->
            <div class="editable-features">
                <div class="features-header">
                    <i class="fas fa-lightbulb"></i>
                    <h6>O que pode ser editado:</h6>
                </div>
                <div class="features-list">
                    <div class="feature-item">
                        <i class="fas fa-check-circle"></i>
                        <span>Evento, horário e descrição</span>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-check-circle"></i>
                        <span>Membros escalados para cada data</span>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-check-circle"></i>
                        <span>Músicas do repertório</span>
                    </div>
                    <div class="feature-item">
                        <i class="fas fa-check-circle"></i>
                        <span>Observações e configurações</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <div class="step-actions">
        <button class="btn btn-secondary btn-prev-step" data-prev="1">
            <i class="fas fa-arrow-left"></i> 
            <span class="btn-text">Anterior</span>
        </button>
        <button class="btn btn-primary btn-next-step" data-next="3">
            <span class="btn-text">Próximo</span>
            <i class="fas fa-arrow-right"></i>
        </button>
    </div>
</div>
                        <!-- PASSO 3 - MEMBROS E DETALHES -->
                        <div class="wizard-step-content" data-step="3">
                            <div class="form-group">
                                <label class="form-label">Evento *</label>
                                <input type="text" class="form-input monthly-scale-event" 
                                       value="${this.escapeHtml(groupData.event || '')}" 
                                       placeholder="Ex: Culto de Adoração, Ensaios...">
                            </div>
                            
                            <div class="form-row">
                               
                                <div class="form-group">
                                    <label class="form-label">Descrição (opcional)</label>
                                    <textarea class="form-textarea monthly-scale-description" 
                                              placeholder="Descrição geral da escala..." 
                                              rows="2">${this.escapeHtml(groupData.description || '')}</textarea>
                                </div>
                            </div>
                            
                            <div class="dates-members-section">
                                <div class="section-header">
                                    <h4><i class="fas fa-calendar-alt"></i> Escalar Membros por Data</h4>
                                    <small id="membersLoadingStatus">
                                        <i class="fas fa-spinner fa-spin"></i> Preparando dados...
                                    </small>
                                </div>
                                
                                <div id="datesMembersContainer" style="margin-top: 20px;">
                                    <!-- As escalas por data serão geradas aqui dinamicamente -->
                                </div>
                            </div>
                            
                            <div class="step-actions">
                                <button class="btn btn-secondary btn-prev-step" data-prev="2">
                                    <i class="fas fa-arrow-left"></i> Anterior
                                </button>
                                <button class="btn btn-primary btn-next-step" data-next="4">
                                    <i class="fas fa-arrow-right"></i> Próximo
                                </button>
                            </div>
                        </div>
                        
                        <!-- PASSO 4 - REVISÃO -->
                        <div class="wizard-step-content" data-step="4">
                            <div class="review-summary">
                                <h4><i class="fas fa-clipboard-check"></i> Revisão da Edição</h4>
                                
                                <div class="edit-mode-badge" style="display: inline-block; margin-bottom: 15px; padding: 5px 10px; background: var(--warning-light); color: var(--warning-dark); border-radius: 4px;">
                                    <i class="fas fa-edit"></i> Modo Edição
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-calendar"></i> Mês:</label>
                                    <span id="reviewMonth">${formattedMonth}</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-church"></i> Ministério:</label>
                                    <span id="reviewMinistry">${ministryName}</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-star"></i> Evento:</label>
                                    <span id="reviewEvent">${this.escapeHtml(groupData.event || '')}</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-clock"></i> Hora:</label>
                                    <span id="reviewTime">${groupData.time || '19:00'}</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-calendar-day"></i> Datas:</label>
                                    <span id="reviewDatesCount">Carregando...</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label><i class="fas fa-users"></i> Membros:</label>
                                    <span id="reviewMembersCount">Carregando...</span>
                                </div>
                                
                                <div class="dates-list-preview" id="datesListPreview">
                                    <div style="text-align: center; padding: 20px;">
                                        <div class="loading-spinner small"></div>
                                        <p>Carregando detalhes...</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="step-actions">
                                <button class="btn btn-secondary btn-prev-step" data-prev="3">
                                    <i class="fas fa-arrow-left"></i> Anterior
                                </button>
                                <button class="btn btn-success" id="updateMonthlyScaleBtn">
                                    <i class="fas fa-save"></i> Salvar Alterações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');
        
        // Configurar fechamento do modal
        modal.find('.modal-close').click(() => modal.remove());
        
        // Configurar wizard em modo de edição
        await this.setupEditMonthlyScaleWizard(modal, groupData);
        
    } catch (error) {
        console.error('💥 Erro ao abrir modal de edição:', error);
        this.showToast('Erro ao carregar modal de edição: ' + error.message, 'error');
    }
}

escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// CONFIGURAR WIZARD EM MODO DE EDIÇÃO
async setupEditMonthlyScaleWizard(modal, groupData) {
    const self = this;
    
    console.log('🛠️ Configurando wizard em modo de edição');
    console.log('📊 Dados do grupo:', {
        scale_group: groupData.scale_group,
        dates: groupData.dates?.length || 0,
        ministry: groupData.ministry_id,
        event: groupData.event
    });
    
    // Guardar dados importantes no modal
    modal.data({
        'editGroupData': groupData,
        'originalScaleGroup': groupData.scale_group,
        'editMode': true,
        'scaleSelections': groupData.selections || {}
    });
    
    // Configurar navegação do wizard CORRETAMENTE
    this.setupWizardNavigation(modal);
    
    // Primeiro, carregar o calendário com as datas já selecionadas
    try {
        await this.loadMonthCalendarForEdit(modal, groupData);
        
        // Ir para o passo 2 após carregar calendário
        setTimeout(() => {
            this.goToWizardStep(modal, '2');
        }, 500);
        
    } catch (error) {
        console.error('❌ Erro ao carregar calendário:', error);
        this.showToast('Erro ao carregar calendário, carregando dados básicos...', 'warning');
        
        // Ir direto para o passo 3 como fallback
        setTimeout(() => {
            this.goToWizardStep(modal, '3');
        }, 1000);
    }
}

setupWizardNavigation(modal) {
    const self = this;
    
    // Limpar eventos anteriores
    modal.find('.btn-next-step').off('click');
    modal.find('.btn-prev-step').off('click');
    modal.find('#cancelMonthlyScale').off('click');
    modal.find('#updateMonthlyScaleBtn').off('click');
    
    // Configurar navegação para próxima etapa
    modal.find('.btn-next-step').on('click', function() {
        const nextStep = $(this).data('next');
        console.log('▶️ Navegando para próximo passo:', nextStep);
        self.goToWizardStep(modal, nextStep);
    });
    
    // Configurar navegação para etapa anterior
    modal.find('.btn-prev-step').on('click', function() {
        const prevStep = $(this).data('prev');
        console.log('◀️ Navegando para passo anterior:', prevStep);
        self.goToWizardStep(modal, prevStep);
    });
    
    // Configurar botão de cancelar
    modal.find('#cancelMonthlyScale').on('click', function() {
        console.log('❌ Cancelando edição');
        if (confirm('Deseja cancelar a edição? As alterações não salvas serão perdidas.')) {
            modal.remove();
        }
    });
    
    // Configurar botão de salvar
    modal.find('#updateMonthlyScaleBtn').on('click', async function() {
        console.log('💾 Iniciando salvamento das alterações...');
        await self.updateMonthlyScaleGroup(modal);
    });
}

// CARREGAR CALENDÁRIO PARA EDIÇÃO
async loadMonthCalendarForEdit(modal, groupData) {
    try {
        console.log('📅 Carregando calendário para edição...');
        
        const container = modal.find('#wizardCalendarContainer');
        let month = groupData.month_reference;
        const ministryId = groupData.ministry_id;
        const existingDates = groupData.dates || [];
        
        // CORREÇÃO: Garantir que o mês está no formato correto YYYY-MM
        if (month && month.length === 7) {
            // Já está no formato correto (YYYY-MM)
        } else if (month && month.includes('/')) {
            // Converter de DD/MM/YYYY para YYYY-MM
            const parts = month.split('/');
            if (parts.length === 3) {
                month = `${parts[2]}-${parts[1]}`;
            }
        } else if (month && month.includes('-') && month.length > 7) {
            // Remover o dia se for YYYY-MM-DD
            month = month.substring(0, 7);
        }
        
        console.log('📅 Mês formatado para API:', month);
        
        // Mostrar loading
        container.html(`
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner large"></div>
                <p style="margin-top: 15px; color: var(--text-secondary);">
                    Carregando calendário para ${this.formatMonthYear(month)}...
                </p>
            </div>
        `);
        
        // Chamar API para obter calendário
        const response = await this.apiCall('/api/scales/month-calendar', 'POST', {
            month_year: month,
            ministry_id: parseInt(ministryId)
        });
        
        if (response && response.success) {
            console.log('✅ Calendário carregado com sucesso');
            this.renderCalendarForEdit(modal, response.data, existingDates);
        } else {
            throw new Error(response?.error || 'Erro ao carregar calendário');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar calendário:', error);
        
        // Fallback: criar calendário básico
        this.createBasicCalendarForEdit(modal, groupData); // Mudei o nome da função
    }
}

createBasicCalendarForEdit(modal, groupData) {
    console.log('🔄 Criando calendário básico como fallback');
    
    const container = modal.find('#wizardCalendarContainer');
    const month = groupData.month_reference;
    const existingDates = groupData.dates || [];
    
    // Extrair ano e mês
    let year, monthNum;
    if (month && month.includes('-')) {
        [year, monthNum] = month.split('-').map(Number);
    } else {
        // Fallback: usar data atual
        const now = new Date();
        year = now.getFullYear();
        monthNum = now.getMonth() + 1;
    }
    
    const monthName = new Date(year, monthNum - 1).toLocaleDateString('pt-BR', { 
        month: 'long', 
        year: 'numeric' 
    });
    
    const firstDayOfMonth = new Date(year, monthNum - 1, 1).getDay();
    const lastDayOfMonth = new Date(year, monthNum, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    
    let html = `
    <div class="calendar-container" style="margin-top: 20px;">
        <div class="calendar-header" style="text-align: center; margin-bottom: 20px;">
            <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${monthName}</h4>
            <small style="color: var(--text-secondary);">Modo edição - ${existingDates.length} data(s) selecionada(s)</small>
            <small style="display: block; color: var(--warning); margin-top: 5px;">
                <i class="fas fa-exclamation-triangle"></i> Calendário básico (modo offline)
            </small>
        </div>
        
        <div class="calendar-weekdays" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 10px; text-align: center;">
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Dom</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Seg</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Ter</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qua</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qui</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sex</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sáb</div>
        </div>
        
        <div class="calendar-days-grid" 
             style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;"
             id="wizardDaysGrid">
    `;
    
    // Dias vazios no início
    for (let i = 0; i < firstDayOfMonth; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    // Dias do mês
    for (let dayNumber = 1; dayNumber <= lastDayOfMonth; dayNumber++) {
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        const isPast = dateStr < today;
        const isToday = dateStr === today;
        const isSelected = existingDates.includes(dateStr);
        
        let dayClass = 'calendar-day';
        let dayStyle = `
            padding: 12px 5px;
            text-align: center;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            min-height: 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 2px solid transparent;
        `;
        
        if (isPast && !isSelected) {
            dayClass += ' past';
            dayStyle += `
                background: var(--secondary) !important;
                color: var(--text-tertiary) !important;
                cursor: not-allowed !important;
                opacity: 0.5;
            `;
        } else if (isSelected) {
            dayClass += ' selected';
            dayStyle += `
                background: var(--success-light) !important;
                color: var(--success-dark) !important;
                border-color: var(--success) !important;
                font-weight: bold;
            `;
        } else {
            dayStyle += `
                background: var(--card-bg);
                color: var(--text-primary);
                border-color: var(--border);
            `;
        }
        
        if (isToday) {
            dayClass += ' today';
            dayStyle += `
                border-color: var(--primary) !important;
                background: var(--primary-light) !important;
            `;
        }
        
        html += `
        <div class="${dayClass}" 
             data-date="${dateStr}"
             data-day="${dayNumber}"
             style="${dayStyle}"
             title="${isPast && !isSelected ? 'Data passada' : isSelected ? 'Data selecionada - clique para remover' : 'Clique para selecionar'}">
            <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 5px;">${dayNumber}</div>
            ${isSelected ? '<div style="font-size: 0.8rem; color: var(--success);">✓</div>' : ''}
            ${isToday ? '<div style="font-size: 0.7rem; color: var(--primary);">Hoje</div>' : ''}
        </div>`;
    }
    
    // Completar calendário
    const totalCells = Math.ceil((firstDayOfMonth + lastDayOfMonth) / 7) * 7;
    const remainingCells = totalCells - (firstDayOfMonth + lastDayOfMonth);
    
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    html += `
        </div>
        
        <div class="calendar-instructions" style="margin-top: 15px; padding: 10px; background: var(--card-bg); border-radius: 8px; text-align: center;">
            <small style="color: var(--text-secondary);">
                <i class="fas fa-mouse-pointer"></i> Datas selecionadas estão marcadas com ✓. Clique para remover ou adicionar novas datas.
            </small>
        </div>
    </div>`;
    
    container.html(html);
    
    // Configurar interações
    this.setupCalendarForEditInteractions(modal, existingDates);
}


// RENDERIZAR CALENDÁRIO PARA EDIÇÃO
renderCalendarForEdit(modal, calendarData, existingDates) {
    const container = modal.find('#wizardCalendarContainer');
    const monthName = calendarData.month_name;
    const year = calendarData.year;
    const month = calendarData.month;
    const today = new Date().toISOString().split('T')[0];
    
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    
    console.log(`📊 Renderizando calendário: ${monthName} ${year}, ${existingDates.length} datas selecionadas`);
    
    let html = `
    <div class="calendar-container" style="margin-top: 20px;">
        <div class="calendar-header" style="text-align: center; margin-bottom: 20px;">
            <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${monthName} ${year}</h4>
            <small style="color: var(--text-secondary);">Modo edição - ${existingDates.length} data(s) selecionada(s)</small>
        </div>
        
        <div class="calendar-weekdays" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 10px; text-align: center;">
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Dom</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Seg</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Ter</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qua</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qui</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sex</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sáb</div>
        </div>
        
        <div class="calendar-days-grid" 
             style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;"
             id="wizardDaysGrid">
    `;
    
    // Dias vazios no início
    for (let i = 0; i < firstDayOfMonth; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    // Dias do mês
    for (let dayNumber = 1; dayNumber <= lastDayOfMonth; dayNumber++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        
        // Verificar se está nos dados da API
        let dayData = Array.isArray(calendarData.calendar) ? 
            calendarData.calendar.find(d => d.date === dateStr) : null;
        
        const isOccupied = dayData ? (dayData.is_occupied || false) : false;
        const isPast = dateStr < today;
        const isToday = dateStr === today;
        const isSelected = existingDates.includes(dateStr);
        
        let dayClass = 'calendar-day';
        let dayStyle = `
            padding: 12px 5px;
            text-align: center;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            min-height: 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 2px solid transparent;
        `;
        
        if (isOccupied && !isSelected) {
            dayClass += ' occupied';
            dayStyle += `
                background: var(--danger-light) !important;
                color: var(--danger) !important;
                cursor: not-allowed !important;
                opacity: 0.7;
            `;
        } else if (isPast && !isSelected) {
            dayClass += ' past';
            dayStyle += `
                background: var(--secondary) !important;
                color: var(--text-tertiary) !important;
                cursor: not-allowed !important;
                opacity: 0.5;
            `;
        } else if (isSelected) {
            dayClass += ' selected';
            dayStyle += `
                background: var(--success-light) !important;
                color: var(--success-dark) !important;
                border-color: var(--success) !important;
                font-weight: bold;
            `;
        } else {
            dayStyle += `
                background: var(--card-bg);
                color: var(--text-primary);
                border-color: var(--border);
            `;
        }
        
        if (isToday) {
            dayClass += ' today';
            dayStyle += `
                border-color: var(--primary) !important;
                background: var(--primary-light) !important;
            `;
        }
        
        html += `
        <div class="${dayClass}" 
             data-date="${dateStr}"
             data-day="${dayNumber}"
             style="${dayStyle}"
             title="${isOccupied && !isSelected ? 'Ocupado' : isPast && !isSelected ? 'Data passada' : isSelected ? 'Data selecionada - clique para remover' : 'Clique para selecionar'}">
            <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 5px;">${dayNumber}</div>
            ${isSelected ? '<div style="font-size: 0.8rem; color: var(--success);">✓</div>' : ''}
            ${isOccupied && !isSelected ? '<div style="position: absolute; top: 5px; right: 5px; color: var(--danger); font-size: 0.8rem;">✗</div>' : ''}
            ${isToday ? '<div style="font-size: 0.7rem; color: var(--primary);">Hoje</div>' : ''}
        </div>`;
    }
    
    // Completar calendário
    const totalCells = Math.ceil((firstDayOfMonth + lastDayOfMonth) / 7) * 7;
    const remainingCells = totalCells - (firstDayOfMonth + lastDayOfMonth);
    
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    html += `
        </div>
        
        <div class="calendar-legend" style="margin-top: 20px; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--card-bg); border: 2px solid var(--border); border-radius: 3px;"></div>
                <small>Disponível</small>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--danger-light); border-radius: 3px;"></div>
                <small>Ocupado</small>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--success-light); border: 2px solid var(--success); border-radius: 3px;"></div>
                <small>Selecionado</small>
            </div>
        </div>
        
        <div class="calendar-instructions" style="margin-top: 15px; padding: 10px; background: var(--card-bg); border-radius: 8px; text-align: center;">
            <small style="color: var(--text-secondary);">
                <i class="fas fa-mouse-pointer"></i> Datas selecionadas estão marcadas com ✓. Clique para remover ou adicionar novas datas.
            </small>
        </div>
    </div>`;
    
    container.html(html);
    
    // Configurar interações
    this.setupCalendarForEditInteractions(modal, existingDates);
}

updateSelectedDatesListForEdit(modal, dates) {
    const infoContainer = modal.find('#selectedDatesInfo');
    const listContainer = modal.find('#selectedDatesList');
    
    if (!dates || dates.length === 0) {
        listContainer.html('<div class="no-dates-message" style="color: var(--text-tertiary); font-style: italic;">Nenhuma data selecionada</div>');
        infoContainer.show();
        return;
    }
    
    // Ordenar datas
    dates.sort();
    
    let listHtml = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
    
    dates.forEach(date => {
        try {
            const [y, m, d] = date.split('-');
            const day = parseInt(d);
            const month = parseInt(m);
            
            listHtml += `
            <div class="date-chip" style="
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--success-light);
                color: var(--success-dark);
                border: 1px solid var(--success);
                border-radius: 20px;
                font-size: 0.9rem;
                font-weight: 500;
            ">
                <span>${day}/${month}</span>
                <button class="remove-date-btn" 
                        data-date="${date}"
                        style="
                            background: none;
                            border: none;
                            color: var(--success-dark);
                            cursor: pointer;
                            font-size: 1.2rem;
                            padding: 0;
                            width: 20px;
                            height: 20px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 50%;
                        "
                        title="Remover data">
                    ×
                </button>
            </div>`;
        } catch (error) {
            console.error('❌ Erro ao processar data:', date, error);
        }
    });
    
    listHtml += '</div>';
    
    listContainer.html(listHtml);
    infoContainer.show();
    
    // Configurar botões de remover
    const self = this;
    listContainer.off('click', '.remove-date-btn').on('click', '.remove-date-btn', function(e) {
        e.stopPropagation();
        const dateToRemove = $(this).data('date');
        
        // Remover seleção visual no calendário
        modal.find(`.calendar-day[data-date="${dateToRemove}"]`).removeClass('selected').css({
            'background': 'var(--card-bg)',
            'border-color': 'var(--border)',
            'color': 'var(--text-primary)'
        });
        
        // Recalcular
        const newSelectedDates = dates.filter(d => d !== dateToRemove);
        self.updateSelectedDatesListForEdit(modal, newSelectedDates);
        
        // Remover das seleções
        const currentSelections = modal.data('scaleSelections') || {};
        delete currentSelections[dateToRemove];
        modal.data('scaleSelections', currentSelections);
        
        // Atualizar botão próximo
        const nextBtn = modal.find('[data-next="3"]');
        nextBtn.prop('disabled', newSelectedDates.length === 0);
    });
}

setupCalendarForEditInteractions(modal, existingDates) {
    const daysGrid = modal.find('#wizardDaysGrid');
    const nextBtn = modal.find('[data-next="3"]');
    const self = this;
    
    // Converter array para manipulação
    let selectedDates = [...existingDates];
    
    // Atualizar lista de datas selecionadas inicialmente
    self.updateSelectedDatesListForEdit(modal, selectedDates);
    
    // Habilitar botão próximo (sempre, pois já tem datas)
    nextBtn.prop('disabled', false);
    
    // DESABILITAR clique para remover/adicionar datas (data travada)
    daysGrid.off('click').on('click', '.calendar-day', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        // Mostrar mensagem informando que não pode alterar
        const $this = $(this);
        const dateStr = $this.data('date');
        const isSelected = $this.hasClass('selected');
        
        if (!isSelected) {
            // Tentou adicionar nova data
            self.showToast('Em modo de edição não é possível adicionar novas datas.', 'warning');
        } else {
            // Tentou remover data existente
            self.showToast('Em modo de edição não é possível remover datas existentes.', 'warning');
        }
        
        return false;
    });
    
    // Adicionar estilo visual indicando que está travado
    daysGrid.find('.calendar-day.selected').css({
        'cursor': 'not-allowed',
        'opacity': '0.9'
    }).attr('title', 'Data travada - não pode ser alterada em modo de edição');
    
    // Adicionar ícone de cadeado nas datas selecionadas
    daysGrid.find('.calendar-day.selected').each(function() {
        const $this = $(this);
        if (!$this.find('.lock-icon').length) {
            $this.append('<div class="lock-icon" style="position: absolute; top: 2px; right: 2px; color: var(--success); font-size: 0.7rem;"><i class="fas fa-lock"></i></div>');
        }
    });
}

// CONFIGURAR INTERAÇÕES DO CALENDÁRIO EM EDIÇÃO
setupCalendarForEditInteractions(modal, existingDates) {
    const daysGrid = modal.find('#wizardDaysGrid');
    const nextBtn = modal.find('[data-next="3"]');
    const self = this; // ADICIONE ESTA LINHA
    
    // Converter array para manipulação
    let selectedDates = [...existingDates];
    
    // Atualizar lista de datas selecionadas inicialmente
    self.updateSelectedDatesListForEdit(modal, selectedDates); // Use self
    
    // Habilitar botão próximo se houver datas
    nextBtn.prop('disabled', selectedDates.length === 0);
    
    // Configurar clique nos dias
    daysGrid.off('click').on('click', '.calendar-day:not(.occupied):not(.past):not(.empty)', function() {
        const $this = $(this);
        const dateStr = $this.data('date');
        const isSelected = $this.hasClass('selected');
        
        if (isSelected) {
            // Remover seleção
            $this.removeClass('selected');
            $this.css({
                'background': 'var(--card-bg)',
                'border-color': 'var(--border)',
                'color': 'var(--text-primary)'
            });
            
            const index = selectedDates.indexOf(dateStr);
            if (index > -1) {
                selectedDates.splice(index, 1);
            }
        } else {
            // Adicionar seleção
            $this.addClass('selected');
            $this.css({
                'background': 'var(--success-light)',
                'border-color': 'var(--success)',
                'color': 'var(--success-dark)'
            });
            selectedDates.push(dateStr);
        }
        
        // Atualizar lista de datas
        self.updateSelectedDatesListForEdit(modal, selectedDates);
        
        // Atualizar seleções no modal
        const currentSelections = modal.data('scaleSelections') || {};
        if (!isSelected && !currentSelections[dateStr]) {
            // Adicionar nova data com seleção vazia
            currentSelections[dateStr] = {
                time: modal.find('.monthly-scale-time').val() || '19:00',
                description: '',
                members: {},
                songs: [],
                music_key: '',
                send_lyrics: true
            };
        } else if (isSelected) {
            // Remover data das seleções
            delete currentSelections[dateStr];
        }
        modal.data('scaleSelections', currentSelections);
        
        // Habilitar/desabilitar botão próximo
        nextBtn.prop('disabled', selectedDates.length === 0);
        
        console.log('📋 Datas selecionadas atualizadas:', selectedDates);
    });
}


// ATUALIZAR ESCALA MENSAL
// ATUALIZAR ESCALA MENSAL - VERSÃO CORRIGIDA
async updateMonthlyScaleGroup(modal) {
    try {
        console.log('💾 Iniciando atualização de escala mensal...');
        this.showLoading('Salvando alterações...');
        
        // Obter dados do modal
        const scaleGroup = modal.data('originalScaleGroup');
        const event = modal.find('.monthly-scale-event').val().trim();
        const month = modal.find('#monthlyScaleMonth').val();
        const ministryId = modal.find('#monthlyScaleMinistry').val();
        const generalDescription = modal.find('.monthly-scale-description').val().trim();
        const generalTime = modal.find('.monthly-scale-time').val();
        const selections = modal.data('scaleSelections') || {};
        
        console.log('📤 Dados para atualização:', {
            scaleGroup,
            event,
            month,
            ministryId,
            datesCount: Object.keys(selections).length
        });
        
        // Validações
        if (!event) {
            throw new Error('O evento é obrigatório');
        }
        
        if (!month) {
            throw new Error('O mês é obrigatório');
        }
        
        if (!ministryId) {
            throw new Error('O ministério é obrigatório');
        }
        
        const dates = Object.keys(selections);
        if (dates.length === 0) {
            throw new Error('Selecione pelo menos uma data');
        }
        
        // Preparar dados para envio
        const updateData = {
            scale_group: scaleGroup,
            event: event,
            description: generalDescription,
            time: generalTime,
            dates_updates: [], // Array para atualizações por data
            dates_to_remove: []
        };
        
        // Coletar dados de cada data
        dates.forEach(date => {
            const dateData = selections[date] || {};
            const members = dateData.members || {};
            
            // Converter membros de objeto para array
            const membersArray = Object.values(members).map(member => ({
                id: member.id,
                function_id: member.function_id || member.role,
                role: member.role || 'Participante',
                status: member.status || 'pending'
            }));
            
            // CORREÇÃO: Preparar músicas com TOM (key)
            const songsArray = [];
            if (dateData.songs && Array.isArray(dateData.songs)) {
                // Ordenar por ordem
                const sortedSongs = [...dateData.songs].sort((a, b) => (a.order || 0) - (b.order || 0));
                
                sortedSongs.forEach((song, index) => {
                    songsArray.push({
                        id: song.id,
                        order: song.order || index + 1,
                        key: song.key || '' // ⬅️ ⬅️ ⬅️ CAMPO KEY AQUI!
                    });
                });
            }
            
            // Preparar dados desta data
            const dateUpdate = {
                date: date,
                time: dateData.time || generalTime || '19:00',
                description: dateData.description || generalDescription || '',
                members: membersArray,
                songs: songsArray, // Usar array corrigido com key
                music_key: dateData.music_key || '', // Remover esta linha se não usar mais tom geral
                send_lyrics: dateData.send_lyrics !== false,
                observations: dateData.observations || []
            };
            
            updateData.dates_updates.push(dateUpdate);
        });
        
        // DEBUG DETALHADO: Verificar se os tons estão sendo enviados
        console.log('🔍 DEBUG DETALHADO - Verificação dos tons:');
        let totalSongs = 0;
        let songsWithKey = 0;
        
        updateData.dates_updates.forEach(dateUpdate => {
            totalSongs += dateUpdate.songs.length;
            const songsWithKeyInDate = dateUpdate.songs.filter(s => s.key && s.key.trim() !== '').length;
            songsWithKey += songsWithKeyInDate;
            
            if (dateUpdate.songs.length > 0) {
                console.log(`📅 ${dateUpdate.date}: ${dateUpdate.songs.length} música(s)`);
                dateUpdate.songs.forEach((song, i) => {
                    console.log(`   🎵 ${i + 1}. ID: ${song.id}, Tom: "${song.key || '(vazio)'}", Ordem: ${song.order}`);
                });
            }
        });
        
        console.log('📊 RESUMO DOS DADOS PARA ENVIO:', {
            totalDates: updateData.dates_updates.length,
            totalMembers: updateData.dates_updates.reduce((sum, date) => sum + date.members.length, 0),
            totalSongs: totalSongs,
            songsWithKey: songsWithKey,
            songsWithoutKey: totalSongs - songsWithKey
        });
        
        // Mostrar alerta se houver músicas sem tom
        if (totalSongs > 0 && songsWithKey === 0) {
            console.warn('⚠️ ATENÇÃO: Todas as músicas estão sem tom definido!');
        }
        
        // Enviar atualização
        const response = await this.apiCall('/api/scales/monthly/update-group-detailed', 'PUT', updateData);
        
        if (response && response.success) {
            const message = response.message || 'Escala atualizada com sucesso!';
            console.log('✅ Atualização bem-sucedida:', response.data);
            
            // Mostrar resumo do que foi atualizado
            let summaryMessage = message;
            if (response.data) {
                const data = response.data;
                summaryMessage += `\n• ${data.updated_scales || 0} data(s) atualizada(s)`;
                if (data.notifications_created > 0) {
                    summaryMessage += `\n• ${data.notifications_created} notificação(ões) enviada(s)`;
                }
                if (data.removed_scales > 0) {
                    summaryMessage += `\n• ${data.removed_scales} data(s) removida(s)`;
                }
                
                // Adicionar informação sobre músicas
                if (totalSongs > 0) {
                    summaryMessage += `\n• ${totalSongs} música(s) incluída(s)`;
                    if (songsWithKey > 0) {
                        summaryMessage += ` (${songsWithKey} com tom definido)`;
                    }
                }
            }
            
            this.showToast('Escala atualizada com sucesso!', 'success', 5000);
            
            // Fechar modal
            modal.remove();
            
            // Recarregar dados
            setTimeout(async () => {
                await this.loadDataFromAPI();
                if (this.state.currentNav === 'home') {
                    this.loadDashboard();
                }
            }, 1000);
            
        } else {
            throw new Error(response?.error || 'Erro ao atualizar escala');
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar escala:', error);
        this.showToast('Erro ao atualizar: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}

// END FUNCTION SESSION EDIT SCALES



async saveMonthlyScaleGroupChanges(modal, groupData) {
    try {
        const event = modal.find('#editGroupEvent').val().trim();
        const time = modal.find('#editGroupTime').val();
        const description = modal.find('#editGroupDescription').val().trim();
        
        if (!event || !time) {
            this.showToast('Evento e hora são obrigatórios!', 'error');
            return;
        }
        
        // Coletar membros selecionados
        const members = [];
        modal.find('.member-checkbox:checked').each(function() {
            const memberId = $(this).val();
            const memberItem = $(this).closest('.member-scale-item');
            const functionSelect = memberItem.find('.member-function-select');
            const functionId = functionSelect.val();
            const functionName = functionSelect.find('option:selected').text();
            
            members.push({
                id: parseInt(memberId),
                function_id: functionId ? parseInt(functionId) : null,
                role: functionName,
                status: 'pending'
            });
        });
        
        if (members.length === 0) {
            this.showToast('Selecione pelo menos um membro!', 'error');
            return;
        }
        
        this.showLoading('Salvando alterações...');
        
        const response = await this.apiCall('/api/scales/monthly/update-group', 'PUT', {
            scale_group: groupData.group_info.scale_group,
            event: event,
            time: time,
            description: description,
            members: members
        });
        
        if (response && response.success) {
            this.showToast('Escala mensal atualizada com sucesso!');
            modal.remove();
            
            // Recarregar dados
            await this.loadDataFromAPI();
            
            // Recarregar dashboard
            if (this.state.currentNav === 'home') {
                this.loadDashboard();
            }
        } else {
            this.showToast(response?.error || 'Erro ao atualizar', 'error');
        }
        
    } catch (error) {
        console.error('Erro ao salvar grupo:', error);
        this.showToast('Erro ao salvar alterações', 'error');
    } finally {
        this.hideLoading();
    }
}

// Método para adicionar datas a grupo existente
async addDatesToMonthlyGroup(scaleGroup) {
    try {
        this.showLoading('Preparando para adicionar datas...');
        
        const response = await this.apiCall(`/api/scales/monthly/groups/${scaleGroup}`);
        
        if (response && response.success) {
            this.showAddDatesToGroupModal(response.data);
        } else {
            this.showToast('Erro ao carregar grupo', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

// Modal para adicionar datas a grupo existente
showAddDatesToGroupModal(groupData) {
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 700px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-plus"></i> Adicionar Datas à Escala Mensal
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="group-info" style="margin-bottom: 20px; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                    <h4 style="margin: 0 0 10px 0; color: var(--primary);">${groupData.group_info.event}</h4>
                    <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                        <span><i class="fas fa-layer-group"></i> ${groupData.group_info.ministry_name}</span>
                        <span><i class="fas fa-clock"></i> ${groupData.group_info.time}</span>
                        <span><i class="fas fa-calendar"></i> ${groupData.scales.length} datas existentes</span>
                    </div>
                </div>
                
                <div class="form-group">
                    <label class="form-label">Selecione as novas datas *</label>
                    <input type="month" class="form-input" id="addDatesMonth" 
                           value="${new Date().toISOString().slice(0, 7)}">
                </div>
                
                <div id="addDatesCalendarContainer" style="margin-top: 15px; min-height: 200px;">
                    <div style="text-align: center; padding: 20px;">
                        <div class="loading-spinner"></div>
                        <p>Carregando calendário...</p>
                    </div>
                </div>
                
                <div class="selected-new-dates" id="selectedNewDates" style="display: none; margin-top: 20px;">
                    <h5>Novas datas selecionadas:</h5>
                    <div id="newDatesList"></div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary btn-close-modal">Cancelar</button>
                    <button class="btn btn-primary" id="saveNewDatesBtn" disabled>
                        <i class="fas fa-plus"></i> Adicionar Datas
                    </button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Carregar calendário
    setTimeout(() => {
        this.loadAddDatesCalendar(modal, groupData);
    }, 100);
    
    // Event listeners
    modal.find('#saveNewDatesBtn').click(() => {
        this.saveNewDatesToGroup(modal, groupData);
    });
    
    modal.find('.modal-close, .btn-close-modal').click(() => modal.remove());
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

// Carregar calendário para adicionar datas
async loadAddDatesCalendar(modal, groupData) {
    const monthInput = modal.find('#addDatesMonth').val();
    const ministryId = groupData.group_info.ministry_id;
    
    try {
        const response = await this.apiCall('/api/scales/month-calendar', 'POST', {
            month_year: monthInput,
            ministry_id: ministryId
        });
        
        if (response && response.success) {
            this.renderAddDatesCalendar(modal, response.data, groupData);
        }
    } catch (error) {
        console.error('Erro ao carregar calendário:', error);
    }
}

// Renderizar calendário para adicionar datas
renderAddDatesCalendar(modal, calendarData, groupData) {
    const container = modal.find('#addDatesCalendarContainer');
    const existingDates = groupData.scales.map(s => s.date);
    let selectedNewDates = [];
    
    let html = `
    <div class="add-dates-calendar">
        <div class="calendar-header">
            <h4>${calendarData.month_name} ${calendarData.year}</h4>
            <small>Selecione as datas disponíveis</small>
        </div>
        
        <div class="calendar-weekdays">
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
            <div>Dom</div>
        </div>
        
        <div class="calendar-days-grid">
    `;
    
    // Adicionar dias vazios no início
    const firstDay = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Adicionar dias do mês
    calendarData.calendar.forEach(day => {
        const isOccupied = day.is_occupied;
        const isPast = day.is_past;
        const isExisting = existingDates.includes(day.date);
        
        let dayClass = 'calendar-day';
        if (isOccupied) dayClass += ' occupied';
        if (isPast) dayClass += ' past';
        if (isExisting) dayClass += ' existing';
        
        let dayInfo = '';
        if (isExisting) {
            dayInfo = '<div class="day-existing" title="Já existe nesta data">✓</div>';
        } else if (isOccupied) {
            dayInfo = `<div class="day-occupied" title="${day.event}">✗</div>`;
        }
        
        html += `
        <div class="${dayClass}" data-date="${day.date}" 
             ${isExisting ? 'title="Data já incluída no grupo"' : ''}
             ${isOccupied ? 'title="Data ocupada: ' + day.event + '"' : ''}>
            <div class="day-number">${day.day}</div>
            ${dayInfo}
            ${!isOccupied && !isPast && !isExisting ? '<div class="day-selector"></div>' : ''}
        </div>`;
    });
    
    html += `
        </div>
        
        <div class="calendar-legend" style="margin-top: 15px; display: flex; gap: 15px; font-size: 0.8rem;">
            <div class="legend-item">
                <div class="legend-color" style="background: var(--success);"></div>
                <span>Disponível</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: var(--danger);"></div>
                <span>Ocupado</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: var(--primary);"></div>
                <span>Já no grupo</span>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background: var(--warning);"></div>
                <span>Selecionado</span>
            </div>
        </div>
    </div>`;
    
    container.html(html);
    
    // Event listeners para seleção
    container.off('click', '.calendar-day:not(.occupied):not(.past):not(.existing):not(.empty)');
    container.on('click', '.calendar-day:not(.occupied):not(.past):not(.existing):not(.empty)', function() {
        const date = $(this).data('date');
        const isSelected = $(this).hasClass('selected');
        
        if (isSelected) {
            $(this).removeClass('selected');
            const index = selectedNewDates.indexOf(date);
            if (index > -1) selectedNewDates.splice(index, 1);
        } else {
            $(this).addClass('selected');
            selectedNewDates.push(date);
        }
        
        // Atualizar lista
        updateSelectedDatesList();
        
        // Habilitar/desabilitar botão salvar
        modal.find('#saveNewDatesBtn').prop('disabled', selectedNewDates.length === 0);
    });
    
    function updateSelectedDatesList() {
        const infoContainer = modal.find('#selectedNewDates');
        const listContainer = modal.find('#newDatesList');
        
        if (selectedNewDates.length === 0) {
            infoContainer.hide();
            return;
        }
        
        // Ordenar datas
        selectedNewDates.sort();
        
        let listHtml = '<div class="selected-dates-chips">';
        selectedNewDates.forEach(date => {
            const dateObj = new Date(date);
            listHtml += `
            <div class="date-chip">
                <span>${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}</span>
                <button class="remove-date" data-date="${date}">&times;</button>
            </div>`;
        });
        listHtml += '</div>';
        
        listContainer.html(listHtml);
        infoContainer.show();
        
        // Remover datas
        modal.find('.remove-date').click(function() {
            const dateToRemove = $(this).data('date');
            const index = selectedNewDates.indexOf(dateToRemove);
            if (index > -1) {
                selectedNewDates.splice(index, 1);
                
                // Remover seleção visual
                modal.find(`.calendar-day[data-date="${dateToRemove}"]`).removeClass('selected');
                
                // Atualizar lista
                updateSelectedDatesList();
                
                // Atualizar botão
                modal.find('#saveNewDatesBtn').prop('disabled', selectedNewDates.length === 0);
            }
        });
    }
    
    // Quando mudar o mês
    modal.find('#addDatesMonth').change(() => {
        this.loadAddDatesCalendar(modal, groupData);
    });
}

// Salvar novas datas no grupo
async saveNewDatesToGroup(modal, groupData) {
    try {
        const newDates = [];
        modal.find('.calendar-day.selected').each(function() {
            newDates.push($(this).data('date'));
        });
        
        if (newDates.length === 0) {
            this.showToast('Selecione pelo menos uma data', 'error');
            return;
        }
        
        this.showLoading('Adicionando datas...');
        
        // Para cada nova data, criar uma escala
        let createdCount = 0;
        let errorCount = 0;
        
        for (const dateStr of newDates) {
            try {
                const response = await this.apiCall('/scales', 'POST', {
                    event: groupData.group_info.event,
                    date: dateStr,
                    time: groupData.group_info.time,
                    ministry: groupData.group_info.ministry_id,
                    description: groupData.group_info.description,
                    status: 'pending',
                    scale_type: 'monthly_group',
                    scale_group: groupData.group_info.scale_group,
                    month_reference: groupData.group_info.month_reference,
                    members: groupData.group_info.members,
                    songs: groupData.group_info.songs,
                    observations: groupData.group_info.observations
                });
                
                if (response && response.success) {
                    createdCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
                console.error(`Erro ao criar escala para ${dateStr}:`, error);
            }
        }
        
        this.showToast(`${createdCount} nova(s) data(s) adicionada(s) com sucesso!${errorCount > 0 ? ` (${errorCount} erro(s))` : ''}`);
        modal.remove();
        
        // Recarregar dados
        await this.loadDataFromAPI();
        this.loadDashboard();
        
    } catch (error) {
        this.showToast('Erro ao adicionar datas: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}
debugUserPermissions() {
    if (!this.data.currentUser) {
        console.log('❌ Nenhum usuário logado');
        return;
    }
    
    console.log('🔍 DEBUG - Permissões do usuário:');
    console.log('👤 Usuário:', this.data.currentUser.name);
    console.log('🎭 Role:', this.data.currentUser.role);
    console.log('🔑 Permissões:', this.data.currentUser.permissions);
    console.log('📋 Tem escala_view?', this.hasPermission('escala_view'));
    console.log('📋 Tem escala_view_all?', this.hasPermission('escala_view_all'));
    console.log('📋 Tem all?', this.hasPermission('all'));
    console.log('👑 É líder?', this.isLeader());
    console.log('🎵 É líder de louvor?', this.isWorshipLeader());
    console.log('🗂️ Ministérios:', this.data.currentUser.ministries);
    console.log('📊 Total de escalas:', this.data.scales.length);
    
    // Verificar permissões específicas
    const permissionsToCheck = [
        'escala_view',
        'escala_view_all', 
        'escala_create',
        'escala_edit_all',
        'membros_gerenciar',
        'ministerios_gerenciar',
        'all'
    ];
    
    permissionsToCheck.forEach(perm => {
        console.log(`✅ ${perm}:`, this.hasPermission(perm));
    });
}


// E GARANTIR QUE O canEditScale ESTÁ CORRETO
canEditScale(scale) {
    if (!this.data.currentUser) return false;
    
    // Verificar se é escala passada
    const scaleDate = new Date(scale.date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isPastScale = scaleDate < today;
    
    // Admin pode editar tudo (incluindo passado)
    if (this.data.currentUser.role === 'admin') {
        return true;
    }
    
    // Se é escala passada, ninguém mais pode editar (exceto admin)
    if (isPastScale) {
        return false;
    }
    
    // Para escalas futuras, verificar permissões normais
    if (this.data.currentUser.role === 'lider') {
        return true;
    }
    
    const isLeaderOfThisMinistry = this.isLeaderOfMinistry(scale.ministry);
    if (isLeaderOfThisMinistry) {
        return true;
    }
    
    const hasEditPermission = this.hasPermission('escala_edit_all');
    if (hasEditPermission) {
        return true;
    }
    
    return false;
}


// Verifica se o usuário pode visualizar uma escala
canViewScale(scale) {
    if (!this.data.currentUser) return false;
    
    // Admin e líderes podem ver tudo
    if (this.data.currentUser.role === 'admin' || this.hasPermission('escala_view_all')) {
        return true;
    }
    
    // Líder do ministério pode ver escalas do seu ministério
    if (this.isLeaderOfMinistry(scale.ministry)) return true;
    
    // Membro da escala pode ver
    const isMember = scale.members && scale.members.some(m => m.id === this.data.currentUser.id);
    if (isMember) return true;
    
    // Membro do ministério pode ver escalas do ministério
    const userMinistries = this.data.currentUser.ministries || [];
    const hasMinistryAccess = userMinistries.includes(parseInt(scale.ministry));
    
    return hasMinistryAccess;
}

isLeaderOfMinistry(ministryId) {
    console.log('👑 VERIFICANDO LIDERANÇA - Ministério ID:', ministryId);
    
    if (!this.data.currentUser) {
        console.log('❌ Usuário não logado');
        return false;
    }
    
    // Admin é líder de todos os ministérios
    if (this.data.currentUser.role === 'admin') {
        console.log('✅ É ADMIN - Líder de todos os ministérios');
        return true;
    }
    
    // Converter ministryId para número para comparação
    const ministryIdNum = parseInt(ministryId);
    console.log('🔢 Ministry ID convertido:', ministryIdNum);
    
    // Encontrar o ministério
    const ministry = this.data.ministries.find(m => m.id === ministryIdNum);
    console.log('📋 Ministério encontrado:', ministry);
    
    if (!ministry) {
        console.log('❌ Ministério não encontrado');
        return false;
    }
    
    console.log('👥 Líder do ministério:', ministry.leader);
    console.log('👤 ID do usuário atual:', this.data.currentUser.id);
    console.log('🎭 Role do usuário:', this.data.currentUser.role);
    
    // CORREÇÃO: Se o ministério não tem líder específico, qualquer líder pode editar
    if (ministry.leader === null && this.data.currentUser.role === 'lider') {
        console.log('✅ Ministério sem líder específico - Usuário é líder geral - Pode editar');
        return true;
    }
    
    // Se tem líder específico, verificar se é o líder
    const ministryLeaderId = parseInt(ministry.leader);
    const currentUserId = parseInt(this.data.currentUser.id);
    
    console.log('🔢 IDs convertidos - Líder:', ministryLeaderId, 'Usuário:', currentUserId);
    
    const isLeader = ministryLeaderId === currentUserId;
    console.log('🎯 É líder?', isLeader);
    
    return isLeader;
}

loadMemberManagementScreen() {
    if (!this.isLeader()) {
        this.showToast('Acesso negado', 'error');
        return this.loadDashboard();
    }

    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Gerenciar Membros</h2>
            <div class="header-actions">
                <span class="view-all" id="refreshMembers">Atualizar</span>
                <span class="view-all" id="permissionsModeBtn" style="margin-left: 10px;">
                    <i class="fas fa-user-shield"></i> Modo Permissões
                </span>
            </div>
        </div>
        
        <div class="card">
            <div class="management-filters">
                <div class="filter-group">
                    <label>Ministério:</label>
                    <select class="form-select" id="ministryFilter">
                        <option value="">Todos os ministérios</option>
                        ${this.data.ministries.filter(m => 
                            this.isLeaderOfMinistry(m.id) || this.hasPermission('ministerios_gerenciar_all')
                        ).map(m => 
                            `<option value="${m.id}">${m.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Pesquisar:</label>
                    <input type="text" class="form-input" id="memberSearch" placeholder="Buscar membro...">
                </div>
            </div>
            
            <div id="membersManagementList">
                <div style="text-align: center; padding: 20px;">
                    <div class="loading-spinner"></div>
                    <p>Carregando membros...</p>
                </div>
            </div>
        </div>
    </div>`;

    $('#appContent').html(content);
    this.loadMembersForManagement();

    $('#refreshMembers').click(() => this.loadMembersForManagement());
    $('#ministryFilter').change(() => this.loadMembersForManagement());
    $('#memberSearch').on('input', () => this.filterMembersList());
    
    // Novo botão para alternar modo
    $('#permissionsModeBtn').click(() => this.togglePermissionsMode());
}

togglePermissionsMode() {
    this.state.isPermissionsMode = !this.state.isPermissionsMode;
    
    const btn = $('#permissionsModeBtn');
    if (this.state.isPermissionsMode) {
        btn.html('<i class="fas fa-users"></i> Modo Normal');
        btn.css('background', 'var(--primary)');
        btn.css('color', 'white');
        this.showToast('Modo Permissões ativado', 'info');
    } else {
        btn.html('<i class="fas fa-user-shield"></i> Modo Permissões');
        btn.css('background', '');
        btn.css('color', '');
        this.showToast('Modo Normal ativado', 'info');
    }
    
    // Recarregar a lista com o modo atual
    this.loadMembersForManagement();
}

async loadMembersForManagement() {
    try {
        this.showLoading('Carregando membros...');
        const ministryId = $('#ministryFilter').val();
        
        console.log('🔐 ANTES da requisição - Token existe?', !!this.data.currentUser?.token);
        
        const response = await this.apiCall('/members/management' + (ministryId ? `?ministry=${ministryId}` : ''));
        
        console.log('🔐 DEPOIS da requisição - Token existe?', !!this.data.currentUser?.token);
        
        if (response && response.success) {
            // ⚠️ CUIDADO: Esta parte pode estar corrompendo o usuário atual completamente
            if (response.data.users && Array.isArray(response.data.users)) {
                // CORREÇÃO: Não sobrescrever o usuário atual completamente
                const currentUser = this.data.currentUser;
                
                // Atualiza a lista de usuários, mas mantém o usuário atual separado
                this.data.users = response.data.users;
                
                // CORREÇÃO: Restaurar o usuário atual com seus dados originais
                const updatedCurrentUser = this.data.users.find(u => u.id === currentUser.id);
                if (updatedCurrentUser) {
                    // ⚠️ IMPORTANTE: Manter o token original!
                    this.data.currentUser = {
                        ...updatedCurrentUser,
                        token: currentUser.token, // ← GARANTIR que o token não é perdido
                        notifications: currentUser.notifications,
                        unavailability: currentUser.unavailability
                    };
                    localStorage.setItem('churchTimeUser', JSON.stringify(this.data.currentUser));
                } else {
                    // Se não encontrou o usuário atual na resposta, manter o original
                    this.data.currentUser = currentUser;
                }
            }
            
            // Alteração aqui: Verificar o modo atual
            if (this.state.isPermissionsMode) {
                this.renderMembersPermissions(response.data.users || []);
            } else {
                this.renderMembersManagement(response.data.users || []);
            }
        } else {
            this.showToast('Erro ao carregar membros', 'error');
        }
    } catch (error) {
        console.error('❌ Erro em loadMembersForManagement:', error);
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

renderMembersPermissions(users) {
    const container = $('#membersManagementList');
    
    if (users.length === 0) {
        container.html(`
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
            <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhum membro encontrado</h3>
            <p style="color: var(--text-tertiary);">Não há membros para gerenciar no ministério selecionado.</p>
        </div>`);
        return;
    }

    // Definição das permissões disponíveis
    const allPermissions = {
        'ministerios_gerenciar': 'Gerenciar Ministérios',
        'membros_gerenciar': 'Gerenciar Membros',
        'escala_view_all': 'Ver Todas as Escalas',
        'escala_create': 'Criar Escalas',
        'escala_edit_all': 'Editar Todas as Escalas',
        'musicas_gerenciar': 'Gerenciar Músicas',
        'unavailability_approve': 'Aprovar Indisponibilidades',
        'all': 'Todas as Permissões (Admin)'
    };

    let html = `
    <div class="permissions-header" style="margin-bottom: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <i class="fas fa-user-shield" style="color: var(--primary); margin-right: 10px;"></i>
                <strong>Modo Permissões</strong> - Gerencie as permissões dos membros
            </div>
            <div>
                <button class="btn btn-sm btn-outline" id="saveAllPermissions">
                    <i class="fas fa-save"></i> Salvar Tudo
                </button>
            </div>
        </div>
        <div style="margin-top: 10px; font-size: 0.9rem; color: var(--text-secondary);">
            <i class="fas fa-info-circle"></i> Marque as permissões que cada membro deve ter. 
            A permissão "all" concede acesso total (apenas admins podem conceder).
        </div>
    </div>`;

    users.forEach(user => {
        const isCurrentUser = user.id === this.data.currentUser.id;
        const userPermissions = user.permissions || [];
        const cannotEdit = isCurrentUser || (user.role === 'admin' && this.data.currentUser.role !== 'admin');
        
        const ministriesText = (user.ministries || []).map(ministryId => {
            const ministry = this.data.ministries.find(m => m.id === ministryId);
            return ministry ? ministry.name : '';
        }).filter(name => name).join(', ') || 'Sem ministérios';

        html += `
        <div class="member-permissions-item" data-user-id="${user.id}">
            <div class="member-permissions-header">
                <div class="member-info-compact">
                    <div class="member-avatar">${this.getInitials(user.name)}</div>
                    <div class="member-details-compact">
                        <div class="member-name-compact">
                            ${user.name} 
                            ${isCurrentUser ? '<span class="badge" style="background: var(--primary); color: white; margin-left: 5px; font-size: 0.7rem;">Você</span>' : ''}
                            <span class="member-role-compact">${user.role}</span>
                        </div>
                        <div class="member-email-compact">${user.email}</div>
                        <div class="member-ministries-compact">${ministriesText}</div>
                    </div>
                </div>
                ${cannotEdit ? 
                    '<div class="cannot-edit-badge">Não editável</div>' : 
                    `<button class="btn btn-sm btn-primary save-member-permissions" data-user-id="${user.id}">
                        <i class="fas fa-save"></i> Salvar
                    </button>`
                }
            </div>
            
            <div class="permissions-grid-compact">
                ${Object.entries(allPermissions).map(([key, label]) => {
                    const isChecked = userPermissions.includes(key);
                    const isDisabled = cannotEdit || 
                                      (key === 'all' && user.role === 'admin') ||
                                      (key === 'all' && this.data.currentUser.role !== 'admin');
                    
                    return `
                    <div class="permission-item-compact">
                        <label class="checkbox-item-compact permission-checkbox" style="display: flex; align-items: center; margin: 3px 0;">
                            <input type="checkbox" 
                                   value="${key}" 
                                   ${isChecked ? 'checked' : ''}
                                   ${isDisabled ? 'disabled' : ''}
                                   data-permission-key="${key}"
                                   data-user-id="${user.id}"
                                   class="permission-checkbox-input"
                                   style="margin-right: 8px;">
                            <span class="permission-label-compact" style="font-size: 0.85rem;">${label}</span>
                        </label>
                    </div>
                    `;
                }).join('')}
            </div>
            
            <div class="permissions-summary" style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border);">
                <small style="color: ${userPermissions.length > 0 ? 'var(--success)' : 'var(--text-tertiary)'};">
                    <i class="fas fa-check-circle"></i> ${userPermissions.length} permissão(ões) ativa(s)
                    ${userPermissions.includes('all') ? 
                        '<span class="badge" style="background: var(--danger); color: white; margin-left: 5px;">ADMIN</span>' : 
                        ''
                    }
                </small>
            </div>
        </div>`;
    });

    container.html(html);
    this.setupPermissionsEvents();
}

// ADICIONAR ESTE MÉTODO PARA PROTEGER O TOKEN
protectUserToken() {
    const originalSetItem = localStorage.setItem;
    const originalRemoveItem = localStorage.removeItem;
    
    // Interceptar setItem para proteger churchTimeUser
    localStorage.setItem = function(key, value) {
        if (key === 'churchTimeUser') {
            try {
                const userData = JSON.parse(value);
                if (!userData.token) {
                    console.error('🚨 Tentativa de salvar usuário sem token!');
                    // Recuperar token atual se existir
                    const currentUser = localStorage.getItem('churchTimeUser');
                    if (currentUser) {
                        try {
                            const currentData = JSON.parse(currentUser);
                            if (currentData.token) {
                                userData.token = currentData.token;
                                value = JSON.stringify(userData);
                                console.log('🔒 Token protegido durante salvamento');
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) {
                console.error('❌ Erro ao proteger token:', e);
            }
        }
        return originalSetItem.call(this, key, value);
    };
    
    // Interceptar removeItem para prevenir remoção acidental
    localStorage.removeItem = function(key) {
        if (key === 'churchTimeUser') {
            console.warn('🚨 Tentativa de remover churchTimeUser bloqueada');
            return; // Não permite remover o usuário
        }
        return originalRemoveItem.call(this, key);
    };
}

// Filtrar lista de membros
filterMembersList() {
    const searchTerm = $('#memberSearch').val().toLowerCase();
    const selector = this.state.isPermissionsMode ? '.member-permissions-item' : '.management-member-item';
    const memberItems = $(selector);
    
    memberItems.each(function() {
        const userName = $(this).find('.member-name, .member-name-compact').text().toLowerCase();
        const userEmail = $(this).find('.member-email, .member-email-compact').text().toLowerCase();
        
        if (userName.includes(searchTerm) || userEmail.includes(searchTerm)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
}

// Configurar eventos das permissões
setupPermissionsEvents() {
    // Salvar permissões de um membro específico
    $(document).off('click', '.save-member-permissions').on('click', '.save-member-permissions', (e) => {
        const userId = $(e.currentTarget).data('user-id');
        this.saveUserPermissions(userId);
    });

    // Salvar todas as permissões de uma vez
    $(document).off('click', '#saveAllPermissions').on('click', '#saveAllPermissions', () => {
        this.saveAllUsersPermissions();
    });
}

async saveUserPermissions(userId, permissions, modal = null) {
    try {
        this.showLoading('Salvando permissões...');
        
        console.log('💾 Enviando permissões para o servidor:', {
            user_id: userId,
            permissions: permissions
        });

        const response = await this.apiCall('/api/users/permissions', 'PUT', {
            user_id: userId,
            permissions: permissions
        });

        if (response && response.success) {
            this.showToast('✅ Permissões atualizadas com sucesso!');
            
            // Fechar modal se existir
            if (modal) {
                modal.remove();
            }
            
            // Atualizar dados locais
            const userIndex = this.data.users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                this.data.users[userIndex].permissions = permissions;
            }
            
            // Recarregar a lista se estiver na tela de gerenciamento
            if (this.state.currentNav === 'management') {
                setTimeout(() => {
                    this.loadMembersForManagement();
                }, 500);
            }
        } else {
            this.showToast(response?.error || '❌ Erro ao salvar permissões', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar permissões:', error);
        this.showToast('❌ Erro de conexão: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}
// Salvar todas as permissões
async saveAllUsersPermissions() {
    if (!confirm('Salvar permissões de TODOS os membros listados?\n\nEsta ação pode levar alguns segundos.')) {
        return;
    }

    try {
        this.showLoading('Salvando todas as permissões...');
        
        const memberItems = $('.member-permissions-item');
        let savedCount = 0;
        let errorCount = 0;
        
        // Processar cada usuário
        for (let i = 0; i < memberItems.length; i++) {
            const item = memberItems.eq(i);
            const userId = item.data('user-id');
            const cannotEdit = item.find('.cannot-edit-badge').length > 0;
            
            if (!cannotEdit) {
                try {
                    const permissionInputs = item.find('.permission-checkbox-input:not(:disabled)');
                    const selectedPermissions = [];
                    
                    permissionInputs.each(function() {
                        if ($(this).prop('checked')) {
                            selectedPermissions.push($(this).val());
                        }
                    });

                    await this.apiCall('/api/users/permissions', 'PUT', {
                        user_id: userId,
                        permissions: selectedPermissions
                    });
                    
                    savedCount++;
                } catch (error) {
                    console.error(`Erro ao salvar permissões do usuário ${userId}:`, error);
                    errorCount++;
                }
            }
        }
        
        this.showToast(
            `Permissões salvas: ${savedCount} membro(s) atualizado(s)${errorCount > 0 ? `, ${errorCount} erro(s)` : ''}`,
            errorCount > 0 ? 'warning' : 'success'
        );
        
    } catch (error) {
        console.error('Erro ao salvar todas as permissões:', error);
        this.showToast('Erro ao salvar permissões', 'error');
    } finally {
        this.hideLoading();
    }
}

renderMembersManagement(users) {
    const container = $('#membersManagementList');
    
    if (users.length === 0) {
        container.html(`
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-users" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
            <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhum membro encontrado</h3>
            <p style="color: var(--text-tertiary);">Não há membros para gerenciar no ministério selecionado.</p>
        </div>`);
        return;
    }

    let html = '';
    users.forEach(user => {
        const userMinistries = user.ministries || [];
        const ministriesText = userMinistries.map(ministryId => {
            const ministry = this.data.ministries.find(m => m.id === ministryId);
            return ministry ? ministry.name : '';
        }).filter(name => name).join(', ');

        // Obter informações de permissões
        const permissionCount = user.permissions?.length || 0;
        const hasAllPermission = user.permissions?.includes('all') || false;
        const isCurrentUser = user.id === this.data.currentUser.id;
        const cannotEditPermissions = isCurrentUser || 
                                     (user.role === 'admin' && this.data.currentUser.role !== 'admin');
        
        // Calcular permissões específicas
        const hasSpecialPermissions = permissionCount > 1 || (permissionCount === 1 && !user.permissions?.includes('escala_view'));
        
        html += `
        <div class="management-member-item" data-user-id="${user.id}">
            <div class="member-info">
                <div class="member-avatar">${this.getInitials(user.name)}</div>
                <div class="member-details">
                    <div class="member-name">
                        ${user.name} 
                        ${isCurrentUser ? '<span class="badge-current-user">Você</span>' : ''}
                    </div>
                    <div class="member-email">${user.email}</div>
                    <div class="member-ministries">${ministriesText || 'Sem ministérios'}</div>
                    <div class="member-role">${this.getRoleText(user.role)}</div>
                    
                    <!-- Badge de permissões -->
                    <div class="permissions-badges" style="margin-top: 8px;">
                        ${hasAllPermission ? 
                            '<span class="badge badge-admin"><i class="fas fa-crown"></i> ADMIN TOTAL</span>' : 
                            hasSpecialPermissions ? 
                            `<span class="badge badge-permissions">
                                <i class="fas fa-user-shield"></i> ${permissionCount} permissão(ões)
                            </span>` : 
                            '<span class="badge badge-default"><i class="fas fa-user"></i> Permissões padrão</span>'
                        }
                        ${cannotEditPermissions ? '<span class="badge badge-locked"><i class="fas fa-lock"></i> Protegido</span>' : ''}
                    </div>
                </div>
            </div>
            <div class="member-actions">
                <button class="btn btn-permissions btn-manage-permissions" 
                        data-user-id="${user.id}" 
                        title="Gerenciar Permissões"
                        ${cannotEditPermissions ? 'disabled' : ''}>
                    <i class="fas fa-user-shield"></i> Permissões
                </button>
                <button class="btn btn-outline btn-manage-ministries" data-user-id="${user.id}" title="Gerenciar Ministérios">
                    <i class="fas fa-layer-group"></i> Ministérios
                </button>
                ${user.id !== this.data.currentUser.id ? `
                <button class="btn btn-danger btn-delete-account" data-user-id="${user.id}" title="Excluir Conta">
                    <i class="fas fa-trash"></i> Excluir
                </button>
                ` : ''}
            </div>
        </div>`;
    });

    container.html(html);
    this.setupMemberManagementEvents();
}

canGrantPermission(permissionKey, targetUser, currentUser) {
    const isCurrentUser = targetUser.id === currentUser.id;
    
    // Não pode editar a si mesmo
    if (isCurrentUser) {
        console.log('❌ Não pode editar a si mesmo');
        return false;
    }
    
    // Se o usuário atual é admin, pode tudo (exceto editar a si mesmo)
    if (currentUser.role === 'admin') {
        console.log('✅ É admin - pode conceder qualquer permissão');
        return true;
    }
    
    // Se o usuário atual não é líder, não pode conceder permissões
    if (currentUser.role !== 'lider') {
        console.log('❌ Não é líder - não pode conceder permissões');
        return false;
    }
    
    // Verificar se é líder do ministério do membro
    const isLeaderOfMemberMinistry = this.isLeaderOfMember(targetUser.id);
    
    if (!isLeaderOfMemberMinistry) {
        console.log('❌ Não é líder do ministério do membro');
        return false;
    }
    
    // Se a permissão é 'all', apenas admins podem conceder
    if (permissionKey === 'all') {
        console.log('❌ Apenas admins podem conceder permissão "all"');
        return false;
    }
    
    console.log('✅ Pode conceder permissão');
    return true;
}
getRoleText(role) {
    const roles = {
        'admin': '👑 Administrador',
        'lider': '🎯 Líder',
        'membro': '👤 Membro'
    };
    return roles[role] || role;
}
setupMemberManagementEvents() {
    // Gerenciar permissões (NOVO)
    $(document).off('click', '.btn-manage-permissions').on('click', '.btn-manage-permissions', (e) => {
        e.stopPropagation();
        const userId = $(e.currentTarget).data('user-id');
        this.openUserPermissionsModal(userId);
    });

    // Gerenciar ministérios do usuário
    $(document).off('click', '.btn-manage-ministries').on('click', '.btn-manage-ministries', (e) => {
        const userId = $(e.currentTarget).data('user-id');
        this.openUserMinistriesModal(userId);
    });

    // Excluir conta
    $(document).off('click', '.btn-delete-account').on('click', '.btn-delete-account', (e) => {
        const userId = $(e.currentTarget).data('user-id');
        this.deleteUserAccount(userId);
    });
}

async loadAvailablePermissions() {
    try {
        console.log('🔍 Carregando permissões disponíveis...');
        const response = await this.apiCall('/api/permissions/available');
        
        if (response && response.success) {
            this.data.availablePermissions = response.data.permissions;
            console.log('✅ Permissões disponíveis carregadas:', Object.keys(this.data.availablePermissions).length, 'permissões');
        } else {
            console.warn('⚠️ Não foi possível carregar permissões do servidor, usando padrão');
            this.loadDefaultPermissions();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar permissões disponíveis:', error);
        this.loadDefaultPermissions();
    }
}

// Fallback para permissões padrão
loadDefaultPermissions() {
    this.data.availablePermissions = {
        'escala_view': 'Ver Escalas',
        'escala_create': 'Criar Escalas',
        'escala_view_all': 'Ver Todas as Escalas',
        'escala_edit_all': 'Editar Todas as Escalas',
        'membros_gerenciar': 'Gerenciar Membros',
        'ministerios_gerenciar': 'Gerenciar Ministérios',
        'musicas_gerenciar': 'Gerenciar Músicas',
        'unavailability_approve': 'Aprovar Indisponibilidades',
        'membros_gerenciar_all': 'Gerenciar Todos Membros',
        'month_scales': 'Criar escalas mensais',
        'all': 'Todas as Permissões (Admin)'
    };
}
openUserPermissionsModal(userId) {
    const user = this.data.users.find(u => u.id === userId);
    if (!user) {
        this.showToast('Usuário não encontrado', 'error');
        return;
    }

    const userPermissions = user.permissions || [];
    const userPermittedMinistries = user.permitted_ministries || {}; // Novo
    console.log('availablePermissions:', this.data.availablePermissions);
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-user-shield"></i> Permissões de ${user.name}
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="user-info-permissions">
                    <!-- ... info do usuário ... -->
                </div>
                
                <div class="permissions-section">
                    <h4>Permissões Gerais</h4>
                    <div class="permissions-list-modal">
                        ${Object.entries(this.data.availablePermissions).map(([key, label]) => {
                            const isChecked = userPermissions.includes(key);
                            const canGrant = this.canGrantPermission(key, user, this.data.currentUser);
                            
                            return `
                            <div class="permission-item-modal ${isChecked ? 'selected' : ''} ${!canGrant ? 'disabled' : ''}">
                                <label class="checkbox-item-modal">
                                    <input type="checkbox" 
                                           value="${key}" 
                                           ${isChecked ? 'checked' : ''}
                                           ${!canGrant ? 'disabled' : ''}
                                           class="permission-checkbox-modal"
                                           data-permission-key="${key}">
                                    <span class="permission-label-modal">
                                        ${label}
                                    </span>
                                </label>
                                
                                <!-- SEÇÃO DE MINISTÉRIOS PERMITIDOS -->
                                ${isChecked && ['escala_view_all', 'escala_create', 'escala_edit_all'].includes(key) ? `
                                <div class="permission-ministries" style="margin-left: 25px; margin-top: 5px; padding: 10px; background: var(--card-bg); border-radius: 5px;">
                                    <small style="color: var(--text-secondary); display: block; margin-bottom: 5px;">
                                        <i class="fas fa-filter"></i> Aplicar a quais ministérios?
                                    </small>
                                    <div class="ministry-checkboxes" data-permission="${key}">
                                        ${this.data.ministries.filter(m => 
                                            this.isLeaderOfMinistry(m.id) || this.data.currentUser.role === 'admin'
                                        ).map(ministry => {
                                            const isPermitted = (userPermittedMinistries[key] || []).includes(ministry.id);
                                            return `
                                            <label style="display: block; margin: 3px 0; font-size: 0.85rem;">
                                                <input type="checkbox" 
                                                       value="${ministry.id}"
                                                       ${isPermitted ? 'checked' : ''}
                                                       class="ministry-permission-checkbox"
                                                       data-permission="${key}">
                                                ${ministry.name}
                                            </label>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                                ` : ''}
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary btn-close-modal">Cancelar</button>
                    <button class="btn btn-primary btn-save-permissions-modal" data-user-id="${user.id}">
                        <i class="fas fa-save"></i> Salvar Permissões
                    </button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');

    // Event listener para salvar
    modal.find('.btn-save-permissions-modal').click(() => {
        const selectedPermissions = [];
        const permittedMinistries = {}; // Novo
        
        modal.find('.permission-checkbox-modal:checked:not(:disabled)').each(function() {
            const permissionKey = $(this).val();
            selectedPermissions.push(permissionKey);
            
            // Se é uma permissão que precisa de ministério específico
            if (['escala_view_all', 'escala_create', 'escala_edit_all'].includes(permissionKey)) {
                const ministryCheckboxes = modal.find(`.ministry-permission-checkbox[data-permission="${permissionKey}"]:checked`);
                const ministryIds = [];
                
                ministryCheckboxes.each(function() {
                    ministryIds.push(parseInt($(this).val()));
                });
                
                if (ministryIds.length > 0) {
                    permittedMinistries[permissionKey] = ministryIds;
                }
            }
        });
        
        this.saveUserPermissions(user.id, selectedPermissions, permittedMinistries, modal);
    });

    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

async saveUserPermissions(userId, permissions, permittedMinistries = {}, modal = null) {
    try {
        this.showLoading('Salvando permissões...');
        
        console.log('💾 Enviando permissões para o servidor:', {
            user_id: userId,
            permissions: permissions,
            permitted_ministries: permittedMinistries  // Novo
        });

        const response = await this.apiCall('/api/users/permissions', 'PUT', {
            user_id: userId,
            permissions: permissions,
            permitted_ministries: permittedMinistries  // Novo
        });

        if (response && response.success) {
            this.showToast('✅ Permissões atualizadas com sucesso!');
            
            // Atualizar dados locais
            const userIndex = this.data.users.findIndex(u => u.id === userId);
            if (userIndex !== -1) {
                this.data.users[userIndex].permissions = permissions;
                this.data.users[userIndex].permitted_ministries = permittedMinistries;
            }
            
            if (modal) {
                modal.remove();
            }
            
            // Recarregar se estiver na tela de gerenciamento
            if (this.state.currentNav === 'management') {
                setTimeout(() => {
                    this.loadMembersForManagement();
                }, 500);
            }
        } else {
            this.showToast(response?.error || '❌ Erro ao salvar permissões', 'error');
        }
    } catch (error) {
        console.error('❌ Erro ao salvar permissões:', error);
        this.showToast('❌ Erro de conexão: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}


// Substitua o método openUserMinistriesModal por este:
openUserMinistriesModal(userId) {
    // Primeiro tenta encontrar o usuário nos dados locais
    let user = this.data.users.find(u => u.id === userId);
    
    // Se não encontrou localmente, busca na lista de gerenciamento
    if (!user) {
        // Procura no container de gerenciamento
        const memberItem = $(`.management-member-item[data-user-id="${userId}"]`);
        if (memberItem.length > 0) {
            const memberName = memberItem.find('.member-name').text().replace(' (Você)', '');
            const memberEmail = memberItem.find('.member-email').text();
            const memberRole = memberItem.find('.member-role').text();
            
            user = {
                id: userId,
                name: memberName,
                email: memberEmail,
                role: memberRole,
                ministries: [] // Vamos buscar os ministérios via API
            };
        }
    }

    if (!user) {
        this.showToast('Usuário não encontrado', 'error');
        return;
    }

    this.showLoading('Carregando ministérios...');

    // Busca os dados completos do usuário via API
    this.apiCall(`/members/${userId}`)
        .then(response => {
            this.hideLoading();
            
            if (response && response.success) {
                const userData = response.data.user;
                this.showUserMinistriesModal(userData);
            } else {
                this.showToast('Erro ao carregar dados do usuário', 'error');
            }
        })
        .catch(error => {
            this.hideLoading();
            console.error('Erro ao buscar usuário:', error);
            // Mostra modal mesmo sem dados completos
            this.showUserMinistriesModal(user);
        });
}

// Método separado para mostrar o modal
showUserMinistriesModal(user) {
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title">Ministérios de ${user.name}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="user-info" style="margin-bottom: 20px; padding: 15px; background: var(--card-bg); border-radius: 8px;">
                    <div style="font-weight: 500;">${user.name}</div>
                    <div style="font-size: 0.9rem; color: var(--text-secondary);">${user.email}</div>
                    <div style="font-size: 0.8rem; color: var(--text-tertiary);">${user.role}</div>
                </div>
                
                <div class="user-ministries-list">
                    ${this.renderUserMinistriesList(user.ministries)}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary btn-close-modal">Fechar</button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');

    // Event listeners simples para fechar
    modal.find('.modal-close, .btn-close-modal').on('click', () => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}


// Método auxiliar para renderizar a lista de ministérios (mantém o mesmo)
renderUserMinistriesList(userMinistries) {
    if (!userMinistries || !Array.isArray(userMinistries) || userMinistries.length === 0) {
        return `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-layer-group" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
            <p style="color: var(--text-secondary);">Este membro não pertence a nenhum ministério</p>
        </div>`;
    }

    const ministryNames = userMinistries.map(ministryId => {
        const ministry = this.data.ministries.find(m => m.id === ministryId);
        return ministry ? ministry.name : null;
    }).filter(name => name !== null);

    if (ministryNames.length === 0) {
        return `
        <div style="text-align: center; padding: 20px;">
            <i class="fas fa-layer-group" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
            <p style="color: var(--text-secondary);">Ministérios não encontrados</p>
        </div>`;
    }

    return `
    <div class="ministries-view-list">
        ${ministryNames.map(ministryName => `
            <div class="ministry-view-item">
                <div class="ministry-view-icon">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="ministry-view-name">${ministryName}</div>
            </div>
        `).join('')}
    </div>`;
}

// Método para apenas visualizar escala (para quem não pode editar)
viewScale(scaleId) {
    const scale = this.data.scales.find(s => s.id === scaleId);
    if (!scale) return;

    const ministry = this.data.ministries.find(m => m.id === parseInt(scale.ministry));
    const canEdit = this.canEditScale(scale);
    const isWorshipMinistry = ministry && ministry.name.toLowerCase().includes('louvor');
    
    // Buscar músicas da escala
    const scaleSongs = scale.songs || [];
    const songsDetails = scaleSongs.map(songId => {
        return this.data.songs.find(s => s.id === songId);
    }).filter(song => song);

    const modal = $(`
    <div class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">${scale.event}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="view-scale-details">
                    <div class="detail-item">
                        <label>Data:</label>
                        <span>${this.formatDate(scale.date)}</span>
                    </div>
                    <div class="detail-item">
                        <label>Hora:</label>
                        <span>${scale.time}</span>
                    </div>
                    <div class="detail-item">
                        <label>Ministério:</label>
                        <span class="ministry-badge">${ministry?.name || 'N/A'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Descrição:</label>
                        <span>${scale.description || 'Sem descrição'}</span>
                    </div>
                    <div class="detail-item">
                        <label>Status:</label>
                        <span class="status-badge status-${scale.status}">${this.getStatusText(scale.status)}</span>
                    </div>
                    
                    <!-- SEÇÃO DE MÚSICAS (APENAS PARA LOUVOR) -->
                    ${isWorshipMinistry && songsDetails.length > 0 ? `
                    <div class="music-section" style="margin-top: 20px; padding-top: 20px; border-top: 2px solid var(--primary-light);">
                        <h4 style="color: var(--primary); margin-bottom: 15px;">
                            <i class="fas fa-music"></i> Repertório da Escala
                            ${scale.music_key ? `<span class="music-key-badge" style="margin-left: 10px; background: var(--accent); color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem;">
                                <i class="fas fa-guitar"></i> ${scale.music_key}
                            </span>` : ''}
                        </h4>
                        
                        <div class="songs-grid-view">
                            ${songsDetails.map((song, index) => {
                                const hasLyrics = song.lyrics && song.lyrics.trim() !== '';
                                const hasChords = song.chords && song.chords.trim() !== '';
                                const hasYouTube = song.youtubeId && song.youtubeId.trim() !== '';
                                
                                return `
                                <div class="song-view-item" data-song-id="${song.id}">
                                    <div class="song-view-number">${index + 1}</div>
                                    <div class="song-view-info">
                                        <div class="song-view-title">${song.title}</div>
                                        <div class="song-view-artist">${song.artist}</div>
                                        <div class="song-view-meta">
                                            ${song.duration ? `<span><i class="fas fa-clock"></i> ${song.duration}</span>` : ''}
                                            ${hasYouTube ? `<span><i class="fab fa-youtube"></i> Vídeo</span>` : ''}
                                            ${hasLyrics ? `<span><i class="fas fa-file-alt"></i> Letra</span>` : ''}
                                            ${hasChords ? `<span><i class="fas fa-guitar"></i> Cifra</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="song-view-actions">
                                        ${hasYouTube ? `
                                        <button class="btn btn-sm btn-outline btn-preview-youtube" 
                                                data-song-id="${song.id}"
                                                data-youtube="${song.youtubeId}"
                                                title="Prévia do YouTube">
                                            <i class="fas fa-play"></i>
                                        </button>
                                        ` : ''}
                                        ${(hasLyrics || hasChords) ? `
                                        <button class="btn btn-sm btn-outline btn-view-lyrics-chords" 
                                                data-song-id="${song.id}"
                                                title="Ver Letra e Cifra">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        ` : ''}
                                    </div>
                                </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="members-list" style="margin-top: ${isWorshipMinistry ? '30px' : '20px'};">
                        <h4>Membros da Escala:</h4>
                        ${this.renderScaleMembersView(scale.members || [])}
                    </div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-close-modal">Fechar</button>
                ${canEdit ? `<button class="btn btn-primary btn-edit-scale-modal" data-scale-id="${scale.id}">Editar Escala/button>` : ''}
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Event listeners
    modal.find('.btn-edit-scale-modal').click(() => {
        modal.remove();
        this.openSingleScaleModal(scaleId);
    });
    
    // Prévia do YouTube
    modal.find('.btn-preview-youtube').click(function() {
        const songId = $(this).data('song-id');
        const youtubeId = $(this).data('youtube');
        const song = songsDetails.find(s => s.id === songId);
        churchTimeApp.showMusicPreview(songId, youtubeId);
    });
    
    // Ver letra e cifra
    modal.find('.btn-view-lyrics-chords').click(function() {
        const songId = $(this).data('song-id');
        churchTimeApp.showLyricsAndChords(songId);
    });
    
    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}
// Método para renderizar membros da escala no modal de visualização
renderScaleMembersView(members) {
    if (!members || members.length === 0) {
        return '<div class="no-members">Nenhum membro nesta escala</div>';
    }

    let html = '';
    members.forEach(member => {
        const user = this.data.users.find(u => u.id === member.id);
        if (user) {
            const unavailable = this.isUserUnavailable(user, this.state.selectedDate);
            const statusClass = unavailable ? 'unavailable' : '';
            const statusText = unavailable ? ' (Indisponível)' : '';
            
            html += `
            <div class="member-view-item ${statusClass}">
                <div class="member-view-avatar">${this.getInitials(user.name)}</div>
                <div class="member-view-info">
                    <div class="member-view-name">${user.name}</div>
                    <div class="member-view-role">${member.role}${statusText}</div>
                </div>
            </div>`;
        }
    });
    
    return html;
}
renderScaleMembersPreview(members, scaleDate) {
    let html = '';
    let count = 0;
    
    // Verificar se há músicas nesta escala
    const scale = this.data.scales.find(s => {
        const scaleDateStr = new Date(s.date).toISOString().split('T')[0];
        const targetDateStr = new Date(scaleDate).toISOString().split('T')[0];
        return scaleDateStr === targetDateStr;
    });
    
    const hasMusic = scale && scale.songs && scale.songs.length > 0;
    const isWorshipMinistry = scale && this.data.ministries.find(m => 
        m.id === parseInt(scale.ministry) && m.name.toLowerCase().includes('louvor')
    );
    
    members.forEach(member => {
        const user = this.data.users.find(u => u.id === member.id);
        if (user && count < 3) {
            const unavailable = this.isUserUnavailable(user, scaleDate);
            const statusClass = unavailable ? 'unavailable' : '';
            const statusTitle = unavailable ? 'INDISPONÍVEL' : '';
            
            html += `<div class="member-avatar ${statusClass}" title="${user.name} (${member.role})${statusTitle ? ' - ' + statusTitle : ''}">${this.getInitials(user.name)}</div>`;
            count++;
        }
    });
    
    if (members.length > 3) {
        html += `<div class="member-avatar">+${members.length - 3}</div>`;
    }
    
    // Adicionar ícone de música se tiver músicas e for louvor
    if (hasMusic && isWorshipMinistry) {
        html += `<div class="music-indicator" title="${scale.songs.length} música(s) nesta escala">
                    <i class="fas fa-music"></i>
                 </div>`;
    }
    
    return html;
}
    isUserUnavailable(user, date) {
        if (!user.unavailability || user.unavailability.length === 0) return false;
        
        const targetDate = new Date(date);
        return user.unavailability.some(period => {
            const startDate = new Date(period.start_date || period.start);
            const endDate = new Date(period.end_date || period.end);
            return targetDate >= startDate && targetDate <= endDate && period.status === 'approved';
        });
    }

   // MÉTODO CORRIGIDO - Este deve estar na classe ChurchTimeApp
renderScaleMembers(modal, ministryId, selectedMembers = []) {
    console.log('renderScaleMembers chamado:', { ministryId, selectedMembers });
    
    const membersList = modal.find('.scale-members-list');
    if (membersList.length === 0) {
        console.error('Elemento .scale-members-list não encontrado');
        return;
    }
    
    membersList.empty();

    // Encontrar membros do ministério
    const ministryMembers = this.data.users.filter(user => {
        if (!user.ministries) return false;
        return user.ministries.includes(parseInt(ministryId));
    });

    console.log('Membros do ministério:', ministryMembers);

    if (ministryMembers.length === 0) {
        membersList.html('<div class="no-members-message">Nenhum membro neste ministério</div>');
        return;
    }

    ministryMembers.forEach(user => {
        const isSelected = selectedMembers.some(m => m.id === user.id);
        const memberRole = selectedMembers.find(m => m.id === user.id)?.role || '';
        
        const checkboxItem = $(`
            <div class="checkbox-item">
                <input type="checkbox" id="scale-member-${user.id}" value="${user.id}" ${isSelected ? 'checked' : ''}>
                <label for="scale-member-${user.id}">
                    ${user.name} (${user.skills?.join(', ') || 'Sem habilidades'})
                </label>
                <select class="form-select member-role" style="margin-left: 10px; width: auto;">
                    <option value="">Função</option>
                    ${this.data.roles.map(role => 
                        `<option value="${role}" ${role === memberRole ? 'selected' : ''}>${role}</option>`
                    ).join('')}
                </select>
            </div>
        `);
        
        membersList.append(checkboxItem);
    });
}


// Agora vamos corrigir as funções de notificação para serem mais resilientes
async checkAndShowNotifications() {
    if (!this.data.currentUser) return;

    try {
        console.log('🔔 Verificando notificações...');
        
        // Buscar notificações com timeout
        const notificationsPromise = this.apiCall('/notifications').catch(error => {
            console.warn('⚠️ Erro ao buscar notificações:', error.message);
            return null;
        });
        
        // Buscar solicitações pendentes apenas se for líder (com timeout)
        let pendingRequestsPromise = Promise.resolve(null);
        if (this.isLeader()) {
            pendingRequestsPromise = this.apiCall('/unavailability/pending').catch(error => {
                console.warn('⚠️ Erro ao buscar solicitações pendentes:', error.message);
                return null;
            });
        }
        
        // Usar Promise.allSettled para evitar que um erro pare todos
        const [notificationsResult, pendingRequestsResult] = await Promise.allSettled([
            notificationsPromise,
            pendingRequestsPromise
        ]);
        
        // Processar notificações
        if (notificationsResult.status === 'fulfilled' && notificationsResult.value) {
            const response = notificationsResult.value;
            let notifications = [];
            
            if (response && response.success && response.data && response.data.notifications) {
                notifications = response.data.notifications;
            }
            
            const oldCount = this.data.currentUser.notifications?.length || 0;
            const newCount = notifications.length;
            
            this.data.currentUser.notifications = notifications;
            this.updateNotificationBadge(notifications);
            
            if (newCount > oldCount && oldCount > 0) {
                const newNotifications = newCount - oldCount;
                this.showToast(`Você tem ${newNotifications} nova(s) notificação(ões)`, 'info');
            }
        }
        
        // Processar solicitações pendentes (apenas para líderes)
        if (this.isLeader() && pendingRequestsResult.status === 'fulfilled' && pendingRequestsResult.value) {
            const response = pendingRequestsResult.value;
            let pendingRequests = [];
            
            if (response && response.success && response.data && response.data.pending_requests) {
                pendingRequests = response.data.pending_requests;
            }
            
            this.data.pendingRequests = pendingRequests;
            this.updatePendingRequestsBadge(pendingRequests);
            
            const oldPendingCount = this.data.oldPendingRequestsCount || 0;
            const newPendingCount = pendingRequests.length;
            
            if (newPendingCount > oldPendingCount && oldPendingCount > 0) {
                const newRequests = newPendingCount - oldPendingCount;
                this.showToast(`Você tem ${newRequests} nova(s) solicitação(ões) de indisponibilidade`, 'warning');
            }
            
            this.data.oldPendingRequestsCount = newPendingCount;
        }
        
        // Atualizar a tela se estiver na página de notificações
        if (this.state.currentNav === 'notifications') {
            this.showNotifications();
        }
        
    } catch (error) {
        console.error('❌ Erro inesperado ao verificar notificações:', error);
    }
}

    updateNotificationBadge(notifications) {
    if (!notifications || !Array.isArray(notifications)) {
        $('#notificationsBtn').find('.notification-badge').remove();
        return;
    }

    const unreadCount = notifications.filter(notification => {
        const isRead = notification.is_read;
        return isRead === 0 || isRead === false || !isRead;
    }).length;

    const bellIcon = $('#notificationsBtn');
    let badge = bellIcon.find('.notification-badge');
    
    // Remover badge se não há notificações
    if (unreadCount === 0) {
        badge.remove();
        bellIcon.removeClass('has-notifications');
        return;
    }
    
    // Atualizar ou criar badge
    if (badge.length === 0) {
        badge = $('<span class="notification-badge"></span>');
        bellIcon.append(badge);
    }
    
    badge.text(unreadCount > 99 ? '99+' : unreadCount);
    bellIcon.addClass('has-notifications');
    
    // Adicionar animação para novas notificações
    if (unreadCount > 0) {
        badge.addClass('pulse');
        setTimeout(() => badge.removeClass('pulse'), 2000);
    }
}

isLeaderOfMember(userId) {
    if (!this.data.currentUser) return false;
    if (this.data.currentUser.role === 'admin') return true;
    if (this.data.currentUser.role !== 'lider') return false;
    
    // Buscar o membro
    const targetMember = this.data.users.find(u => u.id === userId);
    if (!targetMember) return false;
    
    // Verificar se o usuário atual é líder de algum ministério do membro
    const targetMemberMinistries = targetMember.ministries || [];
    const currentUserLedMinistries = this.data.ministries
        .filter(m => parseInt(m.leader) === this.data.currentUser.id)
        .map(m => m.id);
    
    // Verificar interseção
    return targetMemberMinistries.some(ministryId => 
        currentUserLedMinistries.includes(ministryId)
    );
}

    loadMembersScreen() {

    const content = `
<div class="content-section">
    <div class="section-title">
        <h2>Membros</h2>
        ${this.hasPermission('membros_gerenciar') ? `
            <button class="action-btn" id="addMemberBtn">
                <i class="fas fa-user-plus"></i>
                Adicionar
            </button>` : ''}
    </div>

    <div class="card">
        <div id="membersListDetailed"></div>
    </div>
</div>`;


    $('#appContent').html(content);
    this.renderMembersDetailed();

    if (this.hasPermission('membros_gerenciar')) {
        $(document).off('click', '#addMemberBtn').on('click', '#addMemberBtn', () => {
            this.openMemberModal();
        });
    }
}

// Método para abrir modal com bloqueio
openModal(modalElement) {
    // Fechar modais existentes
    this.closeAllModals();
    
    // Adicionar classe de bloqueio
    $('body').addClass('modal-open');
    
    // Adicionar modal ao body
    modalElement.appendTo('body');
    
    // Configurar event listeners para fechar
    this.setupModalCloseEvents(modalElement);
}
  // Método para fechar todos os modais
closeAllModals() {
    $('.modal').remove();
    $('body').removeClass('modal-open');
}


// Configurar eventos de fechar modal
setupModalCloseEvents(modal) {
    // Fechar com X
    modal.find('.modal-close').off('click').on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAllModals();
    });
    
    // Fechar com Cancelar
    modal.find('.btn-cancel, .btn-close-modal, .btn-secondary').off('click').on('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeAllModals();
    });
    
    // Fechar clicando no fundo
    modal.off('click').on('click', (e) => {
        if (e.target === modal[0]) {
            this.closeAllModals();
        }
    });
    
    // Fechar com ESC
    $(document).off('keyup.modal').on('keyup.modal', (e) => {
        if (e.keyCode === 27) { // ESC
            this.closeAllModals();
        }
    });
}

    renderMembersDetailed() {
        const container = $('#membersListDetailed');
        if (container.length === 0) return;

        let membersHtml = '';
        let userMembers = this.data.users;

        if (!this.hasPermission('membros_gerenciar_all')) {
            const userMinistries = this.data.currentUser.ministries || [];
            userMembers = this.data.users.filter(user => {
                const userUserMinistries = user.ministries || [];
                return userUserMinistries.some(m => userMinistries.includes(m));
            });
        }

        if (userMembers.length === 0) {
            membersHtml = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-users" style="font-size: 2rem; margin-bottom: 10px; color: var(--text-secondary);"></i>
                <p>Nenhum membro encontrado</p>
            </div>`;
        } else {
            userMembers.forEach(user => {
                const ministriesText = Array.isArray(user.ministries) && user.ministries.length > 0
                    ? user.ministries.map(ministryId => {
                        const ministry = this.data.ministries.find(m => m.id === ministryId);
                        return ministry ? ministry.name : '';
                    }).filter(name => name).join(', ')
                    : 'Sem ministérios';

                membersHtml += `
                <div class="list-item" data-user-id="${user.id}">
                    <div class="item-avatar">${this.getInitials(user.name)}</div>
                    <div class="item-content">
                        <div class="item-title">${user.name} ${user.id === this.data.currentUser.id ? '(Você)' : ''}</div>
                        <div class="item-subtitle">${Array.isArray(user.skills) ? user.skills.join(', ') : 'Sem habilidades'}</div>
                        <div class="item-subtitle" style="font-size: 0.8rem; color: var(--text-tertiary);">${ministriesText}</div>
                        ${this.getUserRoleBadges(user)}
                    </div>
                    <div class="item-action">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>`;
            });
        }

        container.off('click', '.list-item[data-user-id]').html(membersHtml);
        container.on('click', '.list-item[data-user-id]', (e) => {
            const userId = $(e.currentTarget).data('user-id');
            this.openMemberModal(userId);
        });
    }

    getUserRoleBadges(user) {
        let badges = '';
        if (user.role === 'admin') {
            badges += '<span class="role-badge role-admin">Administrador</span>';
        } else if (user.role === 'lider') {
            badges += '<span class="role-badge role-worship">Líder</span>';
        }
        return badges;
    }

   loadMinistriesScreen() {
    if (this.data.currentUser?.role === 'membro') {
        this.showToast('Acesso negado', 'error');
        return this.loadDashboard();
    }

    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Ministérios</h2>
            ${this.hasPermission('ministerios_gerenciar') ? '<span class="view-all" id="addMinistryBtn">Adicionar</span>' : ''}
        </div>
        
        <div class="card">
            <div id="ministriesListDetailed"></div>
        </div>
    </div>`;

    $('#appContent').html(content);
    this.renderMinistriesDetailed();

    if (this.hasPermission('ministerios_gerenciar')) {
        $(document).off('click', '#addMinistryBtn').on('click', '#addMinistryBtn', () => {
            this.openMinistryModal();
        });
    }
}

    renderMinistriesDetailed() {
        const container = $('#ministriesListDetailed');
        if (container.length === 0) return;

        let ministriesHtml = '';

        if (this.data.ministries.length === 0) {
            ministriesHtml = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-layer-group" style="font-size: 2rem; margin-bottom: 10px; color: var(--text-secondary);"></i>
                <p>Nenhum ministério encontrado</p>
            </div>`;
        } else {
            this.data.ministries.forEach(ministry => {
                const leader = ministry.leader ? this.data.users.find(u => u.id === ministry.leader) : null;
                const membersCount = ministry.members ? ministry.members.length : 0;

                ministriesHtml += `
                <div class="list-item" data-ministry-id="${ministry.id}">
                    <div class="item-avatar" style="background: linear-gradient(135deg, var(--secondary), var(--accent));">
                        <i class="fas fa-layer-group"></i>
                    </div>
                    <div class="item-content">
                        <div class="item-title">${ministry.name}</div>
                        <div class="item-subtitle">${ministry.description || 'Sem descrição'}</div>
                        <div class="item-subtitle">${membersCount} membro(s)</div>
                        ${leader ? `<div class="item-subtitle">Líder: ${leader.name}</div>` : ''}
                    </div>
                    <div class="item-action">
                        <i class="fas fa-chevron-right"></i>
                    </div>
                </div>`;
            });
        }

        container.off('click', '.list-item[data-ministry-id]').html(ministriesHtml);
        container.on('click', '.list-item[data-ministry-id]', (e) => {
            const ministryId = $(e.currentTarget).data('ministry-id');
            this.openMinistryModal(ministryId);
        });
    }

    handleBottomNav(nav) {
        this.hideLoading();
        $('.nav-item').removeClass('active');
        $(`.nav-item[data-nav="${nav}"]`).addClass('active');
        this.state.currentNav = nav;

        setTimeout(() => {
            try {
                switch (nav) {
                   case 'functions':
		    if (this.isLeader()) {
			this.loadFunctionsManagementScreen();
		    } else {
			this.showToast('Acesso negado', 'error');
			this.loadDashboard();
		    }
		    break;
                   case 'management':
                    if (this.isLeader()) {
                        this.loadMemberManagementScreen();
                    } else {
                        this.showToast('Acesso negado', 'error');
                        this.loadDashboard();
                    }
                    break;
                    case 'home':
                        this.loadDashboard();
                        break;
                    case 'calendar':
                        this.showCalendar();
                        break;
                    case 'add':
                        this.handleAddAction();
                        break;
                    case 'members':
                        this.loadMembersScreen();
                        break;
                    case 'ministries':
                        this.loadMinistriesScreen();
                        break;
                    case 'pending_requests':
                        this.loadPendingRequestsScreen();
                        break;
                    default:
                        this.loadDashboard();
                        
                }
            } catch (error) {
                this.hideLoading();
                this.showToast('Erro ao carregar página', 'error');
            }
        }, 50);
    }
    
    handleBottomNav2(nav2) {
        this.hideLoading();
        $('.nav-item2').removeClass('active');
        $(`.nav-item2[data-nav="${nav2}"]`).addClass('active');
        this.state.currentNav = nav2;

              console.log('functions');
		    if (this.isLeader()) {
			this.loadFunctionsManagementScreen();
		    } else {
			this.showToast('Acesso negado', 'error');
			this.loadDashboard();
		    }
		   
            }
            
     handleBottomNav3(nav) {
        this.hideLoading();
        $('.nav-item3').removeClass('active');
        $(`.nav-item3[data-nav="${nav}"]`).addClass('active');
        this.state.currentNav = nav;

        setTimeout(() => {
            try {
                switch (nav) {
                   case 'functions':
		    if (this.isLeader()) {
			this.loadFunctionsManagementScreen();
		    } else {
			this.showToast('Acesso negado', 'error');
			this.loadDashboard();
		    }
		    break;
                   case 'management':
                    if (this.isLeader()) {
                        this.loadMemberManagementScreen();
                    } else {
                        this.showToast('Acesso negado', 'error');
                        this.loadDashboard();
                    }
                    break;
                    case 'home':
                        this.loadDashboard();
                        break;
                    case 'calendar':
                        this.showCalendar();
                        break;
                    case 'add':
                        this.handleAddAction();
                        break;
                    case 'members':
                        this.loadMembersScreen();
                        break;
                    case 'ministries':
                        this.loadMinistriesScreen();
                        break;
                    case 'pending_requests':
                        this.loadPendingRequestsScreen();
                        break;
                    default:
                        this.loadDashboard();
                        
                }
            } catch (error) {
                this.hideLoading();
                this.showToast('Erro ao carregar página', 'error');
            }
        }, 50);
    }
             
            

    handleAddAction() {
    // Verificar permissões do usuário
    const isLeader = this.isLeader();
    const isWorshipLeader = this.isWorshipLeader();
    const hasMemberPermission = this.hasPermission('membros_gerenciar');
    const hasMinistryPermission = this.hasPermission('ministerios_gerenciar');
    const hasScalePermission = this.hasPermission('escala_create');

    console.log('➕ handleAddAction - Permissões:', {
        isLeader,
        isWorshipLeader,
        hasMemberPermission,
        hasMinistryPermission,
        hasScalePermission,
        userRole: this.data.currentUser?.role
    });

    const content = `
    <div class="content-section">
        <div class="section-header">
            <h2 class="section-title">Adicionar Novo</h2>
        </div>
        
        <div class="card">
            <!-- Nova Escala - Apenas quem pode criar escalas -->
            ${hasScalePermission ? `
            <div class="list-item" id="addScaleOption">
                <div class="item-avatar" style="background-color: rgba(123, 104, 238, 0.2); color: var(--primary);">
                    <i class="fas fa-calendar-plus"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">Nova Escala</div>
                    <div class="item-subtitle">Criar uma nova escala ministerial</div>
                </div>
                <div class="item-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            ` : ''}
            
            <!-- Novo Membro - Apenas líderes/admins com permissão -->
            ${hasMemberPermission ? `
            <div class="list-item" id="addMemberOption">
                <div class="item-avatar" style="background-color: rgba(76, 175, 80, 0.2); color: var(--success);">
                    <i class="fas fa-user-plus"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">Novo Membro</div>
                    <div class="item-subtitle">Adicionar um novo membro</div>
                </div>
                <div class="item-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            ` : ''}
            
            <!-- Novo Ministério - Apenas líderes/admins com permissão -->
            ${hasMinistryPermission ? `
            <div class="list-item" id="addMinistryOption">
                <div class="item-avatar" style="background-color: rgba(255, 193, 7, 0.2); color: var(--warning);">
                    <i class="fas fa-layer-group"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">Novo Ministério</div>
                    <div class="item-subtitle">Criar um novo ministério</div>
                </div>
                <div class="item-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            ` : ''}
            
            <!-- Nova Música - APENAS para líderes do ministério de louvor -->
            ${isWorshipLeader ? `
            <div class="list-item" id="addSongOption">
                <div class="item-avatar" style="background-color: rgba(247, 37, 133, 0.2); color: var(--accent);">
                    <i class="fas fa-music"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">Nova Música</div>
                    <div class="item-subtitle">Adicionar uma nova música ao repertório</div>
                </div>
                <div class="item-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            ` : ''}
            
            <!-- Solicitar Indisponibilidade - Para todos os membros -->
            ${this.data.currentUser?.role !== 'admin' ? `
            <div class="list-item" id="addUnavailabilityOption">
                <div class="item-avatar" style="background-color: rgba(33, 150, 243, 0.2); color: var(--info);">
                    <i class="fas fa-user-clock"></i>
                </div>
                <div class="item-content">
                    <div class="item-title">Indisponibilidade</div>
                    <div class="item-subtitle">Solicitar período de indisponibilidade</div>
                </div>
                <div class="item-action">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
            ` : ''}
            
            <!-- Mensagem se não tiver permissão para nada -->
            ${!hasScalePermission && !hasMemberPermission && !hasMinistryPermission && !isWorshipLeader ? `
            <div style="text-align: center; padding: 30px;">
                <i class="fas fa-ban" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 15px;"></i>
                <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Sem permissões</h3>
                <p style="color: var(--text-tertiary);">Você não tem permissão para adicionar novos itens.</p>
                <p style="color: var(--text-tertiary); font-size: 0.9rem;">Entre em contato com um líder ou administrador.</p>
            </div>
            ` : ''}
        </div>
    </div>`;

    $('#appContent').html(content);

    // Event listeners (apenas para elementos que existem)
    if (hasScalePermission) {
    $('#addScaleOption').click(() => {
        // CHAMAR WIZARD DE SELEÇÃO, NÃO ABRIR MODAL DIRETO
        this.showScaleTypeSelection();
    });
    }   
    if (hasMemberPermission) {
        $('#addMemberOption').click(() => this.openMemberModal());
    }
    
    if (hasMinistryPermission) {
        $('#addMinistryOption').click(() => this.openMinistryModal());
    }
    
    if (isWorshipLeader) {
        $('#addSongOption').click(() => {
            this.openSongModal();
        });
    }
    
    // Solicitar indisponibilidade (para membros e líderes)
    if (this.data.currentUser?.role !== 'admin') {
        $('#addUnavailabilityOption').click(() => {
            // Mostrar modal para solicitar indisponibilidade
            const today = new Date().toISOString().split('T')[0];
            this.showUnavailabilityModal(today);
        });
    }
}

showScaleTypeSelection() {
    // Remover qualquer modal existente
    $('.modal').remove();
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h3 class="modal-title">Tipo de Escala</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-calendar-alt" style="font-size: 3rem; color: var(--primary); margin-bottom: 20px;"></i>
                    <h3 style="margin-bottom: 15px;">Escolha o tipo de escala</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 30px;">Selecione se deseja criar uma escala única ou uma escala mensal programada.</p>
                </div>
                
                <div class="scale-type-options" style="display: flex; flex-direction: column; gap: 15px;">
                    <!-- OPÇÃO 1: ESCALA ÚNICA -->
                    <div class="scale-type-option" id="singleScaleOption">
                        <div class="option-content">
                            <div class="option-icon" style="background: var(--success-light); color: var(--success);">
                                <i class="fas fa-calendar-day"></i>
                            </div>
                            <div class="option-info">
                                <h4>Escala Única</h4>
                                <p>Crie uma escala para uma data específica</p>
                                <ul style="font-size: 0.9rem; color: var(--text-secondary); padding-left: 20px; margin-top: 8px;">
                                    <li>Ideal para eventos únicos</li>
                                    <li>Data específica</li>
                                    <li>Configuração rápida</li>
                                </ul>
                            </div>
                        </div>
                        <div class="option-action">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                    
                    <!-- OPÇÃO 2: ESCALA MENSAIS -->
                    <div class="scale-type-option" id="monthlyScaleOption">
                        <div class="option-content">
                            <div class="option-icon" style="background: var(--primary-light); color: var(--primary);">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <div class="option-info">
                                <h4>Escala Mensal</h4>
                                <p>Programe escalas recorrentes para um mês inteiro</p>
                                <ul style="font-size: 0.9rem; color: var(--text-secondary); padding-left: 20px; margin-top: 8px;">
                                    <li>Programe várias datas de uma vez</li>
                                    <li>Ideal para escalas fixas (todos os domingos, etc.)</li>
                                    <li>Economiza tempo</li>
                                </ul>
                            </div>
                        </div>
                        <div class="option-action">
                            <i class="fas fa-chevron-right"></i>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary btn-close-modal">Cancelar</button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Estilos CSS para as opções
    $('<style>')
        .text(`
            .scale-type-option {
                padding: 20px;
                border: 2px solid var(--border);
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .scale-type-option:hover {
                border-color: var(--primary);
                background: var(--primary-light);
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            .scale-type-option .option-content {
                display: flex;
                gap: 15px;
                align-items: flex-start;
                flex: 1;
            }
            .scale-type-option .option-icon {
                width: 50px;
                height: 50px;
                border-radius: 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.5rem;
            }
            .scale-type-option .option-info h4 {
                margin: 0 0 8px 0;
                color: var(--text-primary);
            }
            .scale-type-option .option-info p {
                margin: 0;
                color: var(--text-secondary);
                font-size: 0.95rem;
            }
            .scale-type-option .option-action {
                color: var(--text-tertiary);
                font-size: 1.2rem;
            }
        `)
        .appendTo('head');
    
    // Event listeners para as opções jonson
    modal.find('#singleScaleOption').click(() => {
        modal.remove();
        this.this.openScaleModal();
    });
    
    modal.find('#monthlyScaleOption').click(() => {
        modal.remove();
        this.openMonthlyScaleWizard();
    });
    
    // Fechar modal
    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}
    openMemberModal(memberId = null) {
        this.state.currentMemberId = memberId;
        const modal = $('<div class="modal"><div class="modal-content">Carregando...</div></div>');
        modal.appendTo('body');
        
        setTimeout(() => {
            modal.remove();
            this.showToast('Funcionalidade em desenvolvimento', 'warning');
        }, 1000);
    }

    openMinistryModal(ministryId = null) {
        this.state.currentMinistryId = ministryId;
        const modal = $('<div class="modal"><div class="modal-content">Carregando...</div></div>');
        modal.appendTo('body');
        
        setTimeout(() => {
            modal.remove();
            this.showToast('Funcionalidade em desenvolvimento', 'warning');
        }, 1000);
    }

    openSongModal(songId = null) {
        // ✅ Verificar se é líder de louvor
    if (!this.isWorshipLeader()) {
        this.showToast('Apenas líderes do ministério de louvor podem gerenciar músicas.', 'error');
        return;
    }
    
    this.state.currentSongId = songId;
        const modal = $('<div class="modal"><div class="modal-content">Carregando...</div></div>');
        modal.appendTo('body');
        
        setTimeout(() => {
            modal.remove();
            this.showToast('Funcionalidade em desenvolvimento', 'warning');
        }, 1000);
    }


// Método para selecionar tipo de escala
showScaleTypeSelection() {
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3 class="modal-title">Nova Escala</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div style="text-align: center; padding: 20px;">
                    <h4 style="margin-bottom: 30px; color: var(--text-primary);">
                        <i class="fas fa-calendar-plus"></i> Selecione o tipo de escala
                    </h4>
                    
                    <div class="scale-type-options">
                        <!-- Escala Única -->
                        <div class="scale-type-card" id="singleScaleOption">
                            <div class="scale-type-icon" style="background: var(--primary);">
                                <i class="fas fa-calendar-day"></i>
                            </div>
                            <div class="scale-type-content">
                                <h5>Escala Única</h5>
                                <p>Programe Escalas Individual</p>
                                <div class="scale-type-features">
                                    <span><i class="fas fa-check"></i> Membros e funções</span>
                                    <span><i class="fas fa-check"></i> Notificações individuais</span>
                                </div>
                            </div>
                            <div class="scale-type-action">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                        
                        <!-- Escala Mensal -->
                        <div class="scale-type-card" id="monthlyScaleOption">
                            <div class="scale-type-icon" style="background: var(--success);">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <div class="scale-type-content">
                                <h5>Escala Mensal</h5>
                                <p>Programe Escala Mensal</p>
                                <div class="scale-type-features">
                                    <span><i class="fas fa-check"></i> Múltiplas datas</span>
                                    <span><i class="fas fa-check"></i> Notificações em massa</span>
                                </div>
                            </div>
                            <div class="scale-type-action">
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Event listeners
    $('#singleScaleOption').click(() => {
        modal.remove();
        this.openScaleModal();
    });
    
    $('#monthlyScaleOption').click(() => {
        modal.remove();
        this.openMonthlyScaleModal();
    });
    
    // Fechar modal
    modal.find('.modal-close').click(() => modal.remove());
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

// Método para abrir modal de escala mensal
async openMonthlyScaleModal() {
    try {
        const modal = $(`
        <div class="modal">
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title">
                        <i class="fas fa-calendar-alt"></i> Nova Escala Mensal
                    </h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="wizard-steps">
                        <div class="wizard-step active" data-step="1">
                            <span class="step-number">1</span>
                            <span class="step-label">Mês e Ministério</span>
                        </div>
                        <div class="wizard-step" data-step="2">
                            <span class="step-number">2</span>
                            <span class="step-label">Selecionar Datas</span>
                        </div>
                        <div class="wizard-step" data-step="3">
                            <span class="step-number">3</span>
                            <span class="step-label">Membros</span>
                        </div>
                        <div class="wizard-step" data-step="4">
                            <span class="step-number">4</span>
                            <span class="step-label">Revisar</span>
                        </div>
                    </div>
                    
                    <div class="wizard-content">
                        <!-- PASSO 1 -->
                        <div class="wizard-step-content active" data-step="1">
                            <div class="form-group">
                                <label class="form-label">Mês e Ano *</label>
                                <input type="month" class="form-input" id="monthlyScaleMonth" 
                                       value="${new Date().toISOString().slice(0, 7)}">
                            </div>
                            
                            <div class="form-group">
                                <label class="form-label">Ministério *</label>
                                <select class="form-select" id="monthlyScaleMinistry">
                                    <option value="">Selecione um ministério</option>
                                    ${this.data.ministries.filter(m => 
                                        this.isLeaderOfMinistry(m.id) || this.data.currentUser.role === 'admin'
                                    ).map(m => 
                                        `<option value="${m.id}">${m.name}</option>`
                                    ).join('')}
                                </select>
                            </div>
                            
                            <div class="step-actions">
                                <button class="btn btn-secondary" id="cancelMonthlyScale">Cancelar</button>
                                <button class="btn btn-primary btn-next-step" data-next="2">Próximo</button>
                            </div>
                        </div>
                        
                        <!-- PASSO 2 -->
                        <div class="wizard-step-content" data-step="2">
                        <div class="form-group">
                            <label class="form-label">Selecione as datas *</label>
                            <div class="wizard-calendar-container" id="wizardCalendarContainer">
                                <!-- Aqui vai o calendário -->
                            </div>
                        </div>
                        
                        <div class="selected-dates-info" id="selectedDatesInfo" style="display: none;">
                            <h5>Datas Selecionadas:</h5>
                            <div class="selected-dates-list" id="selectedDatesList"></div>
                        </div>
                        
                        <div class="step-actions">
                            <button class="btn btn-secondary btn-prev-step" data-prev="1">Anterior</button>
                            <button class="btn btn-primary btn-next-step" data-next="3" disabled>Próximo</button>
                        </div>
                    </div>
                                            
                                            <!-- PASSO 3 -->
                                    <div class="wizard-step-content" data-step="3">
                        <div class="form-group">
                            <label class="form-label">Evento *</label>
                            <input type="text" class="form-input monthly-scale-event" placeholder="Ex: Culto de Adoração, Ensaios...">
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Hora *</label>
                                <input type="time" class="form-input monthly-scale-time">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Descrição (opcional)</label>
                                <textarea class="form-textarea monthly-scale-description" placeholder="Descrição da escala..." rows="2"></textarea>
                            </div>
                        </div>
                        
                        <!-- NOVO: LISTA DE DATAS COM MEMBROS POR DATA -->
                        <div class="dates-members-section">
                            <div class="section-header">
                                <h4><i class="fas fa-calendar-alt"></i> Escalar Membros por Data</h4>
                                <small id="membersLoadingStatus">Selecione os membros para cada data</small>
                            </div>
                            
                            <!-- Container para as escalas por data -->
                            <div id="datesMembersContainer" style="margin-top: 20px;">
                                <!-- As escalas por data serão geradas aqui dinamicamente -->
                            </div>
                        </div>
                        
                        <div class="step-actions">
                            <button class="btn btn-secondary btn-prev-step" data-prev="2">Anterior</button>
                            <button class="btn btn-primary btn-next-step" data-next="4">Próximo</button>
                        </div>
                    </div>
                                            
                        <!-- PASSO 4 -->
                        <div class="wizard-step-content" data-step="4">
                            <div class="review-summary">
                                <h4>Resumo da Escala Mensal</h4>
                                
                                <div class="summary-item">
                                    <label>Mês:</label>
                                    <span id="reviewMonth"></span>
                                </div>
                                
                                <div class="summary-item">
                                    <label>Ministério:</label>
                                    <span id="reviewMinistry"></span>
                                </div>
                                
                                <div class="summary-item">
                                    <label>Evento:</label>
                                    <span id="reviewEvent"></span>
                                </div>
                                
                                <div class="summary-item">
                                    <label>Hora:</label>
                                    <span id="reviewTime"></span>
                                </div>
                                
                                <div class="summary-item">
                                    <label>Datas Selecionadas:</label>
                                    <span id="reviewDatesCount">0 datas</span>
                                </div>
                                
                                <div class="summary-item">
                                    <label>Membros:</label>
                                    <span id="reviewMembersCount">0 membros</span>
                                </div>
                                
                                <div class="dates-list-preview" id="datesListPreview"></div>
                            </div>
                            
                            <div class="step-actions">
                                <button class="btn btn-secondary btn-prev-step" data-prev="3">Anterior</button>
                                <button class="btn btn-primary" id="createMonthlyScaleBtn">
                                    <i class="fas fa-calendar-check"></i> Criar Escala Mensal
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');
        
        // Configurar wizard
        this.setupMonthlyScaleWizard(modal);
        
    } catch (error) {
        console.error('Erro ao abrir modal de escala mensal:', error);
        this.showToast('Erro ao carregar modal', 'error');
    }
}

renderDatesMembersSections(modal) {
    console.log('📅 Iniciando renderização de escalas por data...');
    
    const container = modal.find('#datesMembersContainer');
    const selectedDates = [];
    
    // Coletar datas selecionadas
    modal.find('.calendar-day.selected').each(function() {
        selectedDates.push($(this).data('date'));
    });
    
    // Ordenar datas mikao
    selectedDates.sort();
    
    let html = '';
    
    selectedDates.forEach((date, index) => {
    const [year, month, day] = date.split('-').map(Number);

    const dateObj = new Date(year, month - 1, day);
    dateObj.setDate(dateObj.getDate() - 1);

    console.log("showdate", date);
        const formattedDate = this.formatDate(date);
        const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const defaultTime = modal.find('.monthly-scale-time').val() || '19:00';
        const isWorshipMinistry = this.isWorshipMinistrySelected(modal);
        
        html += `
        <div class="date-scale-section" data-date="${date}" style="margin-bottom: 30px; padding: 20px; border: 2px solid var(--border); border-radius: 12px;">
            <div class="date-scale-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-light);">
                <div style="flex: 1;">
                    <h5 style="margin: 0 0 5px 0; color: var(--primary);">
                        <i class="fas fa-calendar-day"></i> 
                        ${formattedDate} 
                    </h5>
                    <small style="color: var(--text-secondary);">
                        Data ${index + 1} de ${selectedDates.length}
                    </small>
                </div>
                
                <div class="date-time-input" style="min-width: 120px;">
                    <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                        <i class="fas fa-clock"></i> Horário
                    </label>
                    <input type="time" 
                           class="form-input date-specific-time" 
                           value="${defaultTime}"
                           data-date="${date}"
                           style="padding: 8px 12px; font-size: 0.9rem;">
                </div>
                
                <div class="date-badge" style="background: var(--primary); color: white; padding: 5px 15px; border-radius: 20px; font-size: 0.9rem; margin-left: 15px;">
                    <i class="fas fa-users"></i> <span class="members-count-${date.replace(/-/g, '')}">0</span>
                </div>
            </div>
            
            <!-- NOVO: DESCRIÇÃO INDIVIDUAL POR DATA -->
            <div class="date-description-section" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                    <i class="fas fa-align-left"></i> Descrição para esta data (opcional)
                </label>
                <textarea class="form-input date-specific-description" 
                          data-date="${date}"
                          placeholder="Descreva eventos específicos para este dia..."
                          rows="2"
                          style="width: 100%; padding: 8px 12px; font-size: 0.9rem; border: 1px solid var(--border); border-radius: 6px;"></textarea>
            </div>
            
            <!-- NOVO: SEÇÃO DE MÚSICAS (APENAS PARA MINISTÉRIO DE LOUVOR) -->
            ${isWorshipMinistry ? `
            <div class="date-music-section" style="margin-bottom: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <label style="font-size: 0.85rem; color: var(--text-secondary);">
                        <i class="fas fa-music"></i> Repertório para esta data
                    </label>
                    <button type="button" class="btn btn-sm btn-outline btn-add-music" data-date="${date}" style="font-size: 0.8rem;">
                        <i class="fas fa-plus"></i> Adicionar Música
                    </button>
                </div>
                
                <!-- Container para músicas selecionadas -->
                <div class="selected-songs-container" id="selectedSongs-${date.replace(/-/g, '')}" data-date="${date}" style="margin-top: 10px;">
                    <div class="no-songs-message" style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                        Nenhuma música selecionada
                    </div>
                </div>
                 
                <!-- Opção de enviar letra e cifra -->
                <div class="music-notification-section" style="margin-top: 15px; padding: 10px; background: var(--card-bg); border-radius: 6px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
                        <input type="checkbox" class="date-send-lyrics" data-date="${date}" checked disabled>
                        <i class="fas fa-paper-plane"></i>
                        Enviar letra e cifra aos membros escalados
                    </label>
                    <small style="display: block; margin-top: 5px; color: var(--text-tertiary); font-size: 0.75rem;">
                        Os membros receberão notificação com letra e cifra das músicas selecionadas
                    </small>
                </div>
            </div>
            ` : ''}
            
            <div class="date-members-container" id="membersContainer-${date.replace(/-/g, '')}">
                <!-- Loading state -->
            </div>
        </div>`;
    });
    
    container.html(html);
    
    // Carregar membros para todas as datas
    this.loadMembersForAllDates(modal, selectedDates);
    
    // Configurar eventos para seção de músicas (se for ministério de louvor)
    if (this.isWorshipMinistrySelected(modal)) {
        this.setupDateMusicEvents(modal);
    }
}

openMusicSelectorForDate(modal, date) {
    const modalId = `musicSelector-${date.replace(/-/g, '')}`;
    
    // Remover modal existente se houver
    $(`#${modalId}`).remove();
    
    // Obter músicas já selecionadas para esta data
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    const selectorModal = $(`
    <div class="modal" id="${modalId}">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-music"></i> Selecionar Músicas para ${this.formatDate(date)}
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-container" style="margin-bottom: 20px;">
                    <input type="text" class="form-input music-search-input" 
                           placeholder="Pesquisar músicas por título, artista ou tags..."
                           style="width: 100%;">
                </div>
                
                <div class="songs-list-container" style="max-height: 400px; overflow-y: auto;">
                    ${this.renderMusicSelectorList(date, selectedSongs)}
                </div>
                
                <div class="selected-songs-preview" id="selectedPreview-${date.replace(/-/g, '')}" 
                     style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                    <h4 style="margin-bottom: 10px;">Músicas Selecionadas:</h4>
                    <div class="selected-list"></div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px;">
                    <button class="btn btn-secondary btn-close-music-selector">Cancelar</button>
                    <button class="btn btn-primary btn-save-selected-songs" data-date="${date}">
                        <i class="fas fa-save"></i> Salvar Seleção
                    </button>
                </div>
            </div>
        </div>
    </div>`);
    
    selectorModal.appendTo('body');
    
    // Configurar eventos do seletor
    this.setupMusicSelectorEvents(selectorModal, date, modal);
    
    // Pre-selecionar as músicas já escolhidas
    this.preselectSongsInSelector(selectorModal, selectedSongs);
    
    // Atualizar preview inicial
    this.updateMusicSelectorPreview(selectorModal, date);
}

preselectSongsInSelector(selectorModal, selectedSongs) {
    selectedSongs.forEach(song => {
        const checkbox = selectorModal.find(`input[data-song-id="${song.id}"]`);
        if (checkbox.length) {
            checkbox.prop('checked', true).trigger('change');
            
            // Se houver tom definido, selecionar no dropdown
            if (song.key) {
                const keyInput = checkbox.closest('.song-selector-item').find('.song-key-input');
                keyInput.val(song.key);
            }
        }
    });
}

setupMusicSelectorEvents(selectorModal, date, mainModal) {
    const self = this;
    
    // Pesquisa de músicas
    selectorModal.find('.music-search-input').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        selectorModal.find('.song-selector-item').each(function() {
            const title = $(this).find('.song-title').text().toLowerCase();
            const artist = $(this).find('.song-artist').text().toLowerCase();
            
            if (title.includes(searchTerm) || artist.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    
    // Seleção/deseleção de músicas - MOSTRAR/OCULTAR campo de tom
    selectorModal.off('change', '.song-selector-item input[type="checkbox"]')
        .on('change', '.song-selector-item input[type="checkbox"]', function() {
            const songId = $(this).data('song-id');
            const songItem = $(this).closest('.song-selector-item');
            const keySelector = songItem.find('.song-key-selector');
            const keyInput = songItem.find('.song-key-input');
            
            if ($(this).prop('checked')) {
                songItem.addClass('selected');
                keySelector.show();
                keyInput.prop('disabled', false);
            } else {
                songItem.removeClass('selected');
                keySelector.hide();
                keyInput.prop('disabled', true);
                keyInput.val(''); // Limpar tom ao desmarcar
            }
            
            // Atualizar preview das seleções
            self.updateMusicSelectorPreview(selectorModal, date);
        });
    
    // Clicar em toda a linha para selecionar
    selectorModal.off('click', '.song-selector-item:not(.song-selector-item .btn-preview-lyrics)')
        .on('click', '.song-selector-item:not(.song-selector-item .btn-preview-lyrics)', function(e) {
            if (!$(e.target).is('input[type="checkbox"]') && 
                !$(e.target).is('select') && 
                !$(e.target).closest('.btn-preview-lyrics').length) {
                const checkbox = $(this).find('input[type="checkbox"]');
                checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
            }
        });
    
    // Quando alterar o tom de uma música
    selectorModal.off('change', '.song-key-input')
        .on('change', '.song-key-input', function() {
            self.updateMusicSelectorPreview(selectorModal, date);
        });
    
    // Prévia de letra/cifra
    selectorModal.off('click', '.btn-preview-lyrics')
        .on('click', '.btn-preview-lyrics', function(e) {
            e.stopPropagation();
            const songId = $(this).data('song-id');
            self.showLyricsChordsPreview(songId);
        });
    
    // Salvar seleção
    selectorModal.find('.btn-save-selected-songs').click(() => {
        const selectedSongs = [];
        let order = 1;
        
        selectorModal.find('.song-selector-item input[type="checkbox"]:checked').each(function() {
            const songId = parseInt($(this).data('song-id'));
            const songItem = $(this).closest('.song-selector-item');
            const selectedKey = songItem.find('.song-key-input').val() || '';
            
            selectedSongs.push({
                id: songId,
                order: order++,
                key: selectedKey
            });
        });
        
        self.saveDateSelectedSongs(mainModal, date, selectedSongs);
        selectorModal.remove();
    });
    
    // Fechar seletor
    selectorModal.find('.modal-close, .btn-close-music-selector').click(() => {
        selectorModal.remove();
    });
    
    // Atualizar preview inicial
    this.updateMusicSelectorPreview(selectorModal, date);
}

updateMusicSelectorPreview(selectorModal, date) {
    const selectedSongs = [];
    let order = 1;
    
    selectorModal.find('.song-selector-item input[type="checkbox"]:checked').each(function() {
        const songId = parseInt($(this).data('song-id'));
        const songItem = $(this).closest('.song-selector-item');
        const songTitle = songItem.find('.song-title').text();
        const songArtist = songItem.find('.song-artist').text();
        const songKey = songItem.find('.song-key-input').val() || '';
        
        selectedSongs.push({
            id: songId,
            title: songTitle,
            artist: songArtist,
            key: songKey,
            order: order++
        });
    });
    
    const previewContainer = selectorModal.find(`#selectedPreview-${date.replace(/-/g, '')} .selected-list`);
    
    if (selectedSongs.length === 0) {
        previewContainer.html(`
            <div style="text-align: center; padding: 10px; color: var(--text-tertiary);">
                <i class="fas fa-music"></i>
                <p>Nenhuma música selecionada</p>
            </div>
        `);
        return;
    }
    
    let html = '<div class="selected-songs-preview-list">';
    
    selectedSongs.forEach((song) => {
        const keyBadge = song.key ? 
            `<span class="song-key-badge" style="margin-left: 8px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 0.8rem;">
                ${song.key}
            </span>` : '';
        
        html += `
        <div class="selected-song-preview-item">
            <span class="song-preview-order">${song.order}.</span>
            <div class="song-preview-info">
                <div class="song-preview-title">${song.title}</div>
                <div class="song-preview-artist">${song.artist} ${keyBadge}</div>
            </div>
        </div>`;
    });
    
    html += '</div>';
    previewContainer.html(html);
}
renderMusicSelectorList(date, currentSelections = []) {
    const selectedSongs = currentSelections || this.getDateSelectedSongs(date) || [];
    
    if (this.data.songs.length === 0) {
        return `
        <div style="text-align: center; padding: 40px;">
            <i class="fas fa-music" style="font-size: 2rem; color: var(--text-secondary);"></i>
            <p style="color: var(--text-tertiary); margin-top: 10px;">Nenhuma música cadastrada</p>
        </div>`;
    }
    
    let html = '<div class="songs-grid">';
    
    this.data.songs.forEach(song => {
        const existingSong = selectedSongs.find(s => s.id === song.id);
        const isSelected = !!existingSong;
        const hasLyrics = song.lyrics && song.lyrics.trim() !== '';
        const hasChords = song.chords && song.chords.trim() !== '';
        
        html += `
        <div class="song-selector-item ${isSelected ? 'selected' : ''}" data-song-id="${song.id}">
            <div class="song-checkbox">
                <input type="checkbox" id="song-${date.replace(/-/g, '')}-${song.id}" 
                       ${isSelected ? 'checked' : ''}
                       data-song-id="${song.id}">
            </div>
            <div class="song-info">
                <div class="song-title">${song.title}</div>
                <div class="song-artist">${song.artist}</div>
                <div class="song-meta">
                    ${song.duration ? `<span class="song-duration"><i class="fas fa-clock"></i> ${song.duration}</span>` : ''}
                    ${hasLyrics ? `<span class="song-has-lyrics" title="Possui letra"><i class="fas fa-file-alt"></i></span>` : ''}
                    ${hasChords ? `<span class="song-has-chords" title="Possui cifra"><i class="fas fa-guitar"></i></span>` : ''}
                </div>
                
                
            </div>
            <button class="btn btn-sm btn-outline btn-preview-lyrics" 
                    data-song-id="${song.id}"
                    title="Prévia da letra e cifra">
                <i class="fas fa-eye"></i>
            </button>
        </div>`;
    });
    
    html += '</div>';
    return html;
}
saveDateSelectedSongs(modal, date, songs) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {},
            songs: [],
            music_key: '',
            send_lyrics: true
        };
    }
    
    selections[date].songs = songs;
    modal.data('scaleSelections', selections);
    
    // Atualizar visualização
    this.updateDateSongsPreview(modal, date, songs);
}

showLyricsChordsPreview(songId) {
    const song = this.data.songs.find(s => s.id === songId);
    if (!song) return;
    
    const hasLyrics = song.lyrics && song.lyrics.trim() !== '';
    const hasChords = song.chords && song.chords.trim() !== '';
    
    if (!hasLyrics && !hasChords) {
        this.showToast('Esta música não tem letra ou cifra cadastrada', 'info');
        return;
    }
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3 class="modal-title">${song.title} - ${song.artist}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body" style="max-height: 70vh; overflow-y: auto;">
                <div class="lyrics-chords-preview">
                    ${hasLyrics ? `
                    <div class="section">
                        <h4><i class="fas fa-file-alt"></i> Letra</h4>
                        <div class="preview-content" style="white-space: pre-wrap; font-family: monospace; padding: 10px; background: var(--card-bg); border-radius: 5px;">
                            ${song.lyrics.substring(0, 500)}${song.lyrics.length > 500 ? '...' : ''}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${hasChords ? `
                    <div class="section">
                        <h4><i class="fas fa-guitar"></i> Cifra</h4>
                        <div class="preview-content" style="white-space: pre-wrap; font-family: monospace; padding: 10px; background: var(--card-bg); border-radius: 5px;">
                            ${song.chords.substring(0, 500)}${song.chords.length > 500 ? '...' : ''}
                        </div>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-close-modal">Fechar</button>
            </div>
        </div>
    </div>`);
    
    modal.appendTo('body');
    
    modal.find('.modal-close, .btn-close-modal').click(() => {
        modal.remove();
    });
    
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

updateDateSongsPreview(modal, date, songs) {
    const containerId = `#selectedSongs-${date.replace(/-/g, '')}`;
    const container = modal.find(containerId);
    
    if (!songs || songs.length === 0) {
        container.html(`
            <div class="no-songs-message" style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                Nenhuma música selecionada
            </div>
        `);
        return;
    }
    
    let html = '<div class="selected-songs-list">';
    
    songs.forEach(song => {
        const songData = this.data.songs.find(s => s.id === song.id);
        if (songData) {
            const keyBadge = song.key ? 
                `<span class="song-key-badge" style="margin-left: 8px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 0.8rem;">
                    ${song.key}
                </span>` : '';
            
           html += `
            <div class="selected-song-item" data-song-id="${song.id}" data-song-key="${song.key || ''}">
                <div class="song-details">
                    <div class="song-title">${songData.title}</div>
                    <div class="song-artist">
                        ${songData.artist} 
                        ${song.key ? keyBadge : `
                            <span class="no-key-indicator" title="Tom não definido">
                                <i class="fas fa-guitar"></i>
                                <span class="no-key-text">Sem tom</span>
                                <span class="key-required-badge">!</span>
                            </span>
                        `}
                    </div>
                </div>
                <div class="song-actions">
                    <span class="song-order">#${song.order || 1}</span>
                    <button class="btn-edit-song-key ${!song.key ? 'missing-key' : ''}" data-song-id="${song.id}" title="${!song.key ? 'Definir tom' : 'Alterar tom'}">
                        <i class="fas ${!song.key ? 'fa-exclamation-triangle' : 'fa-guitar'}"></i>
                        ${!song.key ? '<span class="key-required-badge">!</span>' : ''}
                    </button>
                    <button class="btn-remove-song" data-song-id="${song.id}" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        }
    });
    
    html += '</div>';
    container.html(html);
    
    // Configurar botões de remover
    modal.off('click', `.selected-songs-list .btn-remove-song`).on('click', `.selected-songs-list .btn-remove-song`, (e) => {
        e.stopPropagation();
        const songId = parseInt($(e.currentTarget).data('song-id'));
        this.removeSongFromDate(modal, date, songId);
    });
    
    // Configurar botões para editar tom
    modal.off('click', `.selected-songs-list .btn-edit-song-key`).on('click', `.selected-songs-list .btn-edit-song-key`, (e) => {
        e.stopPropagation();
        const songId = parseInt($(e.currentTarget).data('song-id'));
        this.openSongKeyEditor(modal, date, songId);
    });
}

openSongKeyEditor(modal, date, songId) {
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const song = dateData.songs?.find(s => s.id === songId);
    const songData = this.data.songs.find(s => s.id === songId);
    
    if (!song || !songData) return;
    
    // Criar modal simples para editar tom
    const keyModal = $(`
    <div class="modal song-key-modal">
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-guitar"></i> Definir tom para "${songData.title}"
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Tom da música:</label>
                    <select class="form-input song-key-select" 
                            style="width: 100%; padding: 10px 12px; font-size: 1rem;">
                        <option value="">Selecionar tom...</option>
                        <option value="C" ${song.key === 'C' ? 'selected' : ''}>C (Dó)</option>
                        <option value="C#" ${song.key === 'C#' ? 'selected' : ''}>C# (Dó sustenido)</option>
                        <option value="D" ${song.key === 'D' ? 'selected' : ''}>D (Ré)</option>
                        <option value="D#" ${song.key === 'D#' ? 'selected' : ''}>D# (Ré sustenido)</option>
                        <option value="E" ${song.key === 'E' ? 'selected' : ''}>E (Mi)</option>
                        <option value="F" ${song.key === 'F' ? 'selected' : ''}>F (Fá)</option>
                        <option value="F#" ${song.key === 'F#' ? 'selected' : ''}>F# (Fá sustenido)</option>
                        <option value="G" ${song.key === 'G' ? 'selected' : ''}>G (Sol)</option>
                        <option value="G#" ${song.key === 'G#' ? 'selected' : ''}>G# (Sol sustenido)</option>
                        <option value="A" ${song.key === 'A' ? 'selected' : ''}>A (Lá)</option>
                        <option value="A#" ${song.key === 'A#' ? 'selected' : ''}>A# (Lá sustenido)</option>
                        <option value="B" ${song.key === 'B' ? 'selected' : ''}>B (Si)</option>
                        <option value="Cm" ${song.key === 'Cm' ? 'selected' : ''}>Cm (Dó menor)</option>
                        <option value="C#m" ${song.key === 'C#m' ? 'selected' : ''}>C#m (Dó sustenido menor)</option>
                        <option value="Dm" ${song.key === 'Dm' ? 'selected' : ''}>Dm (Ré menor)</option>
                        <option value="D#m" ${song.key === 'D#m' ? 'selected' : ''}>D#m (Ré sustenido menor)</option>
                        <option value="Em" ${song.key === 'Em' ? 'selected' : ''}>Em (Mi menor)</option>
                        <option value="Fm" ${song.key === 'Fm' ? 'selected' : ''}>Fm (Fá menor)</option>
                        <option value="F#m" ${song.key === 'F#m' ? 'selected' : ''}>F#m (Fá sustenido menor)</option>
                        <option value="Gm" ${song.key === 'Gm' ? 'selected' : ''}>Gm (Sol menor)</option>
                        <option value="G#m" ${song.key === 'G#m' ? 'selected' : ''}>G#m (Sol sustenido menor)</option>
                        <option value="Am" ${song.key === 'Am' ? 'selected' : ''}>Am (Lá menor)</option>
                        <option value="A#m" ${song.key === 'A#m' ? 'selected' : ''}>A#m (Lá sustenido menor)</option>
                        <option value="Bm" ${song.key === 'Bm' ? 'selected' : ''}>Bm (Si menor)</option>
                    </select>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-cancel-key">Cancelar</button>
                <button class="btn btn-primary btn-save-key" data-date="${date}" data-song-id="${songId}">
                    <i class="fas fa-save"></i> Salvar
                </button>
            </div>
        </div>
    </div>`);
    
    keyModal.appendTo('body');
    
    // Configurar eventos
    keyModal.find('.modal-close, .btn-cancel-key').click(() => {
        keyModal.remove();
    });
    
    keyModal.find('.btn-save-key').click(() => {
        const newKey = keyModal.find('.song-key-select').val();
        this.updateSongKey(modal, date, songId, newKey);
        keyModal.remove();
    });
}

updateSongKey(modal, date, songId, key) {
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    
    if (dateData.songs) {
        const songIndex = dateData.songs.findIndex(s => s.id === songId);
        if (songIndex !== -1) {
            dateData.songs[songIndex].key = key;
            modal.data('scaleSelections', selections);
            this.updateDateSongsPreview(modal, date, dateData.songs);
        }
    }
}

removeSongFromDate(modal, date, songId) {
    let selections = modal.data('scaleSelections');
    if (!selections || !selections[date]) return;
    
    selections[date].songs = selections[date].songs.filter(song => song.id !== songId);
    modal.data('scaleSelections', selections);
    
    // Atualizar visualização
    this.updateDateSongsPreview(modal, date, selections[date].songs);
}

setupDateMusicEvents(modal) {
    const self = this;
    
    // Botão para adicionar música
    modal.off('click', '.btn-add-music').on('click', '.btn-add-music', function(e) {
        e.stopPropagation();
        const date = $(this).data('date');
        self.openMusicSelectorForDate(modal, date);
    });
    
    // Botão para editar tom de música específica (na lista de músicas selecionadas)
    modal.off('click', '.btn-edit-song-key').on('click', '.btn-edit-song-key', function(e) {
        e.stopPropagation();
        const date = $(this).data('date');
        const songId = parseInt($(this).data('song-id'));
        self.openSongKeyEditor(modal, date, songId);
    });
    
    // Quando mudar opção de enviar letra/cifra
    modal.off('change', '.date-send-lyrics').on('change', '.date-send-lyrics', function() {
        const date = $(this).data('date');
        const shouldSend = $(this).is(':checked');
        self.saveDateSendLyrics(modal, date, shouldSend);
    });
    
    // Quando mudar descrição
    modal.off('change', '.date-specific-description').on('input', '.date-specific-description', function() {
        const date = $(this).data('date');
        const description = $(this).val().trim();
        self.saveDateDescription(modal, date, description);
    });
}

isWorshipMinistrySelected(modal) {
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    if (!ministryId) return false;
    
    const ministry = this.data.ministries.find(m => m.id == ministryId);
    if (!ministry) return false;
    
    const worshipKeywords = ['louvor', 'música', 'worship', 'canto', 'banda', 'coral'];
    const ministryName = ministry.name.toLowerCase();
    
    return worshipKeywords.some(keyword => ministryName.includes(keyword));
}

// MÉTODO NOVO: Carregar membros para todas as datas
async loadMembersForAllDates(modal, selectedDates) {
    console.log('👥 Carregando membros para todas as datas:', selectedDates);
    
    // Carregar em paralelo para melhor performance
    const loadPromises = selectedDates.map(date => 
        this.loadMembersForDate(modal, date)
    );
    
    // Aguardar todos carregarem
    await Promise.all(loadPromises);
    
    console.log('✅ Todos os membros carregados');
}

async loadMembersForDate(modal, date) {
    console.log('👥 Carregando membros para data:', date);
    
    const containerId = `#membersContainer-${date.replace(/-/g, '')}`;
    const container = modal.find(containerId);
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    
    if (!ministryId) {
        container.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Selecione um ministério primeiro.
            </div>
        `);
        return;
    }
    
    // Mostrar loading específico para esta data
    container.html(`
        <div style="text-align: center; padding: 20px;">
            <div class="loading-spinner small"></div>
            <p style="margin-top: 10px; color: var(--text-secondary);">Carregando membros...</p>
        </div>
    `);
    
    try {
        // 1. Buscar membros do ministério (apenas uma vez)
        let ministryMembers = modal.data('ministryMembers');
        let ministryFunctions = modal.data('ministryFunctions');
        
        // Se ainda não carregou, buscar uma vez e armazenar
        if (!ministryMembers || !ministryFunctions) {
            console.log('🔍 Buscando dados do ministério pela primeira vez...');
            
            // Buscar membros
            const membersResponse = await this.apiCall(`/members/management?ministry=${ministryId}`);
            ministryMembers = membersResponse?.success ? 
                membersResponse.data.users.filter(user => {
                    if (!user.ministries) return false;
                    return user.ministries.includes(parseInt(ministryId));
                }) : [];
            
            // Buscar funções
            let functionsResponse;
            try {
                functionsResponse = await this.apiCall(`/api/ministries/${ministryId}/member-functions`);
                ministryFunctions = functionsResponse?.success ? 
                    functionsResponse.data.functions : 
                    this.data.roles.map(role => ({
                        id: role,
                        name: role,
                        color: this.getRandomColor()
                    }));
            } catch (error) {
                console.warn('⚠️ Erro ao buscar funções:', error);
                ministryFunctions = this.data.roles.map(role => ({
                    id: role,
                    name: role,
                    color: this.getRandomColor()
                }));
            }
            
            // Armazenar para reutilização
            modal.data('ministryMembers', ministryMembers);
            modal.data('ministryFunctions', ministryFunctions);
        }
        
        // 2. Verificar indisponibilidade dos membros para esta data específica
        const dateObj = new Date(date);
        
        // 3. Renderizar membros
        this.renderDateMembersList(container, date, ministryMembers, ministryFunctions, dateObj);
        
    } catch (error) {
        console.error('❌ Erro ao carregar membros para data:', error);
        container.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar membros: ${error.message}
            </div>
        `);
    }
}

renderDateMembersList(container, date, ministryMembers, ministryFunctions, dateObj) {
    const modal = container.closest('.modal');
    const selections = modal.data('scaleSelections') || {};
    const dateSelections = selections[date] || {};
    
    // Carregar horário salvo
    const savedTime = dateSelections.time || modal.find('.monthly-scale-time').val() || '19:00';
    
    if (ministryMembers.length === 0) {
        container.html(`
            <div class="alert alert-warning">
                <i class="fas fa-users-slash"></i>
                Nenhum membro neste ministério.
            </div>
        `);
        return;
    }
    
    let membersHtml = `
        <div class="date-members-list" data-date="${date}">
            <div class="members-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">
    `;
    
    ministryMembers.forEach(user => {
        // Verificar se membro está indisponível nesta data
        const isUnavailable = this.isUserUnavailable(user, date);
        
        // Verificar se membro já estava selecionado
        const savedMember = dateSelections.members ? dateSelections.members[user.id] : null;
        const isChecked = !!savedMember;
        const savedFunctionId = savedMember ? savedMember.function_id : '';
        
        membersHtml += `
            <div class="member-date-item ${isUnavailable ? 'unavailable' : ''}" data-user-id="${user.id}">
                <div class="member-selection" style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" 
                           id="member-${date.replace(/-/g, '')}-${user.id}" 
                           class="member-date-checkbox" 
                           data-date="${date}"
                           data-user-id="${user.id}"
                           ${isUnavailable ? 'disabled' : ''}
                           ${isChecked ? 'checked' : ''}>
                    <label for="member-${date.replace(/-/g, '')}-${user.id}" class="member-label" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="member-avatar-small">${this.getInitials(user.name)}</div>
                            <div>
                                <div class="member-name" style="font-weight: 500;">${user.name}</div>
                                <div class="member-skills" style="font-size: 0.85rem; color: var(--text-secondary);">
                                    ${user.skills?.join(', ') || 'Sem habilidades'}
                                </div>
                                ${isUnavailable ? 
                                    '<div class="unavailable-badge" style="color: var(--danger); font-size: 0.8rem;"><i class="fas fa-user-clock"></i> Indisponível</div>' : 
                                    ''}
                            </div>
                        </div>
                    </label>
                </div>
                
                <div class="member-function" style="margin-top: 10px;">
                    <select class="form-select member-date-function" 
                            data-date="${date}"
                            data-user-id="${user.id}"
                            ${isUnavailable || !isChecked ? 'disabled' : ''}
                            style="width: 100%; padding: 8px 12px; font-size: 0.9rem;">
                        <option value="">Selecione a função</option>
                        ${ministryFunctions.map(func => `
                            <option value="${func.id}" 
                                    ${savedFunctionId == func.id ? 'selected' : ''}
                                    data-color="${func.color || '#9147ff'}"
                                    style="${func.color ? `color: ${func.color};` : ''}">
                                ${func.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    });
    
    membersHtml += `
            </div>
            
            <div class="date-summary" style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Resumo da data:</strong>
                        <span class="selected-count-${date.replace(/-/g, '')}">${Object.keys(dateSelections.members || {}).length}</span> membro(s) selecionado(s)
                    </div>
                    <button class="btn btn-sm btn-outline copy-to-next" data-date="${date}">
                        <i class="fas fa-copy"></i> Copiar para próxima data
                    </button>
                </div>
            </div>
        </div>
    `;
    
    container.html(membersHtml);
    
    // Atualizar horário no campo
    modal.find(`.date-specific-time[data-date="${date}"]`).val(savedTime);
    
    // Configurar eventos
    this.setupDateMembersEvents(modal, date);
    
    // Atualizar contador
    this.updateDateMembersCount(modal, date);
}

setupDateMembersEvents(modal, date) {
    const dateSelector = date.replace(/-/g, '');
    const self = this; // Referência para usar dentro dos callbacks
    
    // Quando checkbox mudar (manter existente)
    modal.off('change', `.member-date-checkbox[data-date="${date}"]`)
         .on('change', `.member-date-checkbox[data-date="${date}"]`, function() {
            const isChecked = $(this).is(':checked');
            const userId = $(this).data('user-id');
            const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
            
            functionSelect.prop('disabled', !isChecked);
            if (!isChecked) {
                functionSelect.val('');
            }
            
            // Salvar seleção
            self.saveDateSelection(modal, date, userId, isChecked, functionSelect.val());
            self.updateDateMembersCount(modal, date);
        });
    
    // Quando função mudar (manter existente)
    modal.off('change', `.member-date-function[data-date="${date}"]`)
         .on('change', `.member-date-function[data-date="${date}"]`, function() {
            const userId = $(this).data('user-id');
            const functionValue = $(this).val();
            const isChecked = modal.find(`.member-date-checkbox[data-date="${date}"][data-user-id="${userId}"]`).is(':checked');
            
            // Salvar seleção
            self.saveDateSelection(modal, date, userId, isChecked, functionValue);
            self.updateDateMembersCount(modal, date);
        });
    
    // Quando horário mudar (manter existente)
    modal.off('change', `.date-specific-time[data-date="${date}"]`)
         .on('change', `.date-specific-time[data-date="${date}"]`, function() {
            const timeValue = $(this).val();
            self.saveDateTime(modal, date, timeValue);
        });
    
    // NOVO: Quando descrição mudar
    modal.off('input', `.date-specific-description[data-date="${date}"]`)
         .on('input', `.date-specific-description[data-date="${date}"]`, function() {
            const description = $(this).val().trim();
            self.saveDateDescription(modal, date, description);
        });
    
    // Botão "Copiar para próxima data" (manter existente)
    modal.off('click', `.copy-to-next[data-date="${date}"]`)
         .on('click', `.copy-to-next[data-date="${date}"]`, function() {
            self.copyMembersToNextDate(modal, date);
        });
}

saveDateDescription(modal, date, description) {
    console.log('💾 Salvando descrição para data:', date, description);
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        const defaultTime = modal.find(`.date-specific-time[data-date="${date}"]`).val() || 
                           modal.find('.monthly-scale-time').val() || 
                           '19:00';
        selections[date] = {
            time: defaultTime,
            description: description,
            members: {},
            songs: [],
            music_key: '',
            send_lyrics: true
        };
    } else {
        selections[date].description = description;
    }
    
    modal.data('scaleSelections', selections);
}

// Métodos para músicas
saveDateMusicKey(modal, date, key) {
    let selections = modal.data('scaleSelections');
    if (!selections) return;
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {},
            songs: [],
            music_key: key,
            send_lyrics: true
        };
    } else {
        selections[date].music_key = key;
    }
    
    modal.data('scaleSelections', selections);
}

saveDateSendLyrics(modal, date, shouldSend) {
    let selections = modal.data('scaleSelections');
    if (!selections) return;
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {},
            songs: [],
            music_key: '',
            send_lyrics: shouldSend
        };
    } else {
        selections[date].send_lyrics = shouldSend;
    }
    
    modal.data('scaleSelections', selections);
}


saveDateSelection(modal, date, userId, isSelected, functionId) {
    console.log('💾 Salvando seleção:', { date, userId, isSelected, functionId });
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        const defaultTime = modal.find(`.date-specific-time[data-date="${date}"]`).val() || 
                           modal.find('.monthly-scale-time').val() || 
                           '19:00';
        selections[date] = {
            time: defaultTime,
            description: '',
            members: {}, // Inicializar como objeto
            songs: [],
            music_key: '',
            send_lyrics: true
        };
    }
    
    if (isSelected && functionId && functionId !== '') {
        // Obter nome da função selecionada
        const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
        const functionName = functionSelect.find('option:selected').text();
        
        // CORREÇÃO: Garantir que é um objeto válido
        selections[date].members[userId] = {
            id: parseInt(userId),
            function_id: functionId ? parseInt(functionId) : null,
            role: functionName || 'Participante',
            status: 'pending'
        };
        console.log('✅ Membro adicionado:', selections[date].members[userId]);
    } else {
        // Remover membro
        delete selections[date].members[userId];
        console.log('❌ Membro removido:', userId);
    }
    
    modal.data('scaleSelections', selections);
}

// ADICIONE TAMBÉM ESTE MÉTODO:
saveDateTime(modal, date, time) {
    console.log('🕐 Salvando horário:', { date, time });
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        selections[date] = {
            time: time,
            members: {}
        };
    } else {
        selections[date].time = time;
    }
    
    modal.data('scaleSelections', selections);
}

copyMembersToNextDate(modal, fromDate) {
    const allDates = [];
    modal.find('.calendar-day.selected').each(function() {
        allDates.push($(this).data('date'));
    });
    
    allDates.sort();
    const currentIndex = allDates.indexOf(fromDate);
    
    if (currentIndex < allDates.length - 1) {
        const nextDate = allDates[currentIndex + 1];
        
        // Copiar seleções
        modal.find(`.member-date-checkbox[data-date="${fromDate}"]:checked`).each(function() {
            const userId = $(this).data('user-id');
            const functionSelect = $(this).closest('.member-date-item').find('.member-date-function');
            const functionValue = functionSelect.val();
            
            // Marcar na próxima data
            const nextCheckbox = modal.find(`.member-date-checkbox[data-date="${nextDate}"][data-user-id="${userId}"]`);
            const nextFunction = modal.find(`.member-date-function[data-date="${nextDate}"][data-user-id="${userId}"]`);
            
            if (nextCheckbox.length && !nextCheckbox.prop('disabled')) {
                nextCheckbox.prop('checked', true).trigger('change');
                if (functionValue) {
                    nextFunction.val(functionValue);
                }
            }
        });
        
        // Atualizar contador da próxima data
        this.updateDateMembersCount(modal, nextDate);
        
        this.showToast(`Escalação copiada para ${this.formatDate(nextDate)}`, 'success');
        
        // Scroll para a próxima data
        modal.find(`.date-scale-section[data-date="${nextDate}"]`)[0].scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    } else {
        this.showToast('Esta é a última data', 'info');
    }
}


// Formatar mês/ano
formatMonthYear(monthString) {
    if (!monthString) return '';
    try {
        const [year, month] = monthString.split('-');
        const date = new Date(year, month - 1, 1);
        return date.toLocaleDateString('pt-BR', { 
            month: 'long', 
            year: 'numeric' 
        }).replace(/^\w/, c => c.toUpperCase());
    } catch (e) {
        return monthString;
    }
}

// Obter iniciais
getInitials(name) {
    if (!name) return '??';
    const parts = name.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Verificar se usuário está indisponível
isUserUnavailable(user, date) {
    if (!user || !user.unavailability) return false;
    
    const targetDate = new Date(date);
    return user.unavailability.some(period => {
        const startDate = new Date(period.start_date || period.start);
        const endDate = new Date(period.end_date || period.end);
        return targetDate >= startDate && targetDate <= endDate;
    });
}

// Gerar cor aleatória
getRandomColor() {
    const colors = [
        '#9147ff', '#7B68EE', '#6A5ACD', '#483D8B', '#FF6B6B', '#FF8E6B',
        '#FFD166', '#06D6A0', '#4ECDC4', '#118AB2', '#073B4C', '#7209B7',
        '#F72585', '#4361EE', '#3A0CA3', '#4CC9F0'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

debugScaleSelections(modal) {
    const selections = modal.data('scaleSelections');
    console.log('🔍 DEBUG - Seleções salvas:', selections);
    return selections;
}

updateDateMembersCount(modal, date) {
    const dateSelector = date.replace(/-/g, '');
    const selectedCount = modal.find(`.member-date-checkbox[data-date="${date}"]:checked:not(:disabled)`).length;
    const assignedCount = modal.find(`.member-date-function[data-date="${date}"]:enabled option:selected[value!=""]`).length;
    
    // Atualizar badge
    modal.find(`.members-count-${dateSelector}`).text(selectedCount);
    
    // Atualizar contador no resumo
    modal.find(`.selected-count-${dateSelector}`).text(selectedCount);
    
    // Destacar se tem membros sem função
    if (selectedCount > 0 && assignedCount < selectedCount) {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--warning)');
    } else if (selectedCount > 0) {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--success)');
    } else {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--border)');
    }
}


async loadMinistryMembersForWizard(modal) {
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    
    if (!ministryId) {
        console.error('❌ Ministério não selecionado no wizard');
        modal.find('#membersLoadingStatus').html('<i class="fas fa-exclamation-triangle"></i> Selecione um ministério primeiro');
        return;
    }
    
    const membersContainer = modal.find('#monthlyScaleMembersContainer');
    const loadingStatus = modal.find('#membersLoadingStatus');
    
    console.log('🔍 Iniciando carregamento de membros para ministério:', ministryId);
    
    // Mostrar loading
    membersContainer.html(`
        <div style="text-align: center; padding: 30px;">
            <div class="loading-spinner"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">Carregando membros do ministério...</p>
        </div>
    `);
    
    loadingStatus.html('<i class="fas fa-sync-alt fa-spin"></i> Carregando membros e funções...');
    
    try {
        console.log('📞 Fazendo requisição para API...');
        
        // USAR ROTA EXISTENTE: /members/management com parâmetro de ministério
        const membersResponse = await this.apiCall(`/members/management?ministry=${ministryId}`);
        
        // Buscar funções do ministério (rota existe: /api/ministries/{id}/member-functions)
        const functionsResponse = await this.apiCall(`/api/ministries/${ministryId}/member-functions`).catch(error => {
            console.warn('⚠️ Erro ao buscar funções, usando fallback:', error);
            return { success: true, data: { functions: [] } };
        });
        
        console.log('✅ Respostas recebidas:', {
            members: membersResponse?.success,
            functions: functionsResponse?.success
        });
        
        let members = [];
        let functions = [];
        
        // Processar membros
        if (membersResponse?.success && membersResponse.data?.users) {
            // Filtrar apenas membros do ministério selecionado
            members = membersResponse.data.users.filter(user => {
                if (!user.ministries) return false;
                return user.ministries.includes(parseInt(ministryId));
            });
        } else {
            // Fallback: filtrar membros localmente
            members = this.data.users.filter(user => {
                if (!user.ministries) return false;
                return user.ministries.includes(parseInt(ministryId));
            });
        }
        
        // Processar funções
        if (functionsResponse?.success && functionsResponse.data?.functions) {
            functions = functionsResponse.data.functions;
        } else {
            // Fallback: usar funções padrão
            functions = this.data.roles.map(role => ({
                id: role,
                name: role,
                color: this.getRandomColor()
            }));
        }
        
        console.log('📊 Dados processados:', {
            membrosEncontrados: members.length,
            funcoesEncontradas: functions.length
        });
        
        if (members.length === 0) {
            loadingStatus.html(`<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i> Nenhum membro encontrado neste ministério`);
        } else {
            loadingStatus.html(`<i class="fas fa-check-circle" style="color: var(--success);"></i> ${members.length} membro(s) e ${functions.length} função(ões) carregadas`);
        }
        
        // Renderizar membros
        this.renderMinistryMembersForWizard(modal, members, functions);
        
    } catch (error) {
        console.error('💥 Erro crítico ao carregar membros:', error);
        
        // USAR DADOS LOCAIS COMO FALLBACK
        const members = this.data.users.filter(user => {
            if (!user.ministries) return false;
            return user.ministries.includes(parseInt(ministryId));
        });
        
        const functions = this.data.roles.map(role => ({
            id: role,
            name: role,
            color: this.getRandomColor()
        }));
        
        console.log('🔄 Usando fallback local:', {
            membros: members.length,
            funcoes: functions.length
        });
        
        membersContainer.html(`
            <div style="text-align: center; padding: 20px; color: var(--warning);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Usando dados locais (${members.length} membros)</p>
                <small style="color: var(--text-tertiary);">Erro na conexão com o servidor</small>
            </div>
        `);
        
        loadingStatus.html('<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i> Usando dados locais');
        
        // Renderizar com dados locais
        setTimeout(() => {
            this.renderMinistryMembersForWizard(modal, members, functions);
        }, 500);
    }
}
renderMinistryMembersForWizard(modal, members, functions) {
    const membersContainer = modal.find('#monthlyScaleMembersContainer');
    
    if (members.length === 0) {
        membersContainer.html(`
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-users-slash" style="font-size: 2rem; margin-bottom: 15px;"></i>
                <h4 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhum membro encontrado</h4>
                <p style="color: var(--text-tertiary;">Este ministério não tem membros cadastrados.</p>
                <p style="color: var(--text-tertiary); font-size: 0.9rem; margin-top: 10px;">
                    Adicione membros ao ministério antes de criar escalas.
                </p>
                ${this.hasPermission('membros_gerenciar') ? `
                <button class="btn btn-outline btn-sm" onclick="churchTimeApp.openMemberModal()" style="margin-top: 15px;">
                    <i class="fas fa-user-plus"></i> Gerenciar Membros
                </button>
                ` : ''}
            </div>
        `);
        return;
    }
    
    let html = '<div class="wizard-members-list">';
    
    members.forEach(member => {
        const skillsText = member.skills?.join(', ') || 'Sem habilidades';
        const memberId = member.id;
        
        html += `
        <div class="wizard-member-item" data-member-id="${memberId}">
            <div class="member-selection-section">
                <div class="member-checkbox-wrapper">
                    <input type="checkbox" 
                           id="wizard-member-${memberId}" 
                           class="wizard-member-checkbox" 
                           data-member-id="${memberId}">
                    <label for="wizard-member-${memberId}" class="member-label">
                        <div class="member-avatar-small">${this.getInitials(member.name)}</div>
                        <div class="member-info-compact">
                            <div class="member-name">${member.name}</div>
                            <div class="member-skills">${skillsText}</div>
                            <div class="member-email" style="font-size: 0.8rem; color: var(--text-tertiary); margin-top: 2px;">
                                ${member.email}
                            </div>
                        </div>
                    </label>
                </div>
            </div>
            
            <div class="member-function-section">
                <div class="function-select-wrapper">
                    <label class="function-label" style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                        <i class="fas fa-user-tag"></i> Função na escala:
                    </label>
                    ${functions.length > 0 ? `
                    <select class="form-select wizard-function-select" 
                            data-member-id="${memberId}"
                            style="padding: 8px 12px; font-size: 0.9rem;"
                            disabled>
                        <option value="">Selecione uma função</option>
                        ${functions.map(func => `
                            <option value="${func.id}" 
                                    data-color="${func.color || '#9147ff'}"
                                    style="${func.color ? `color: ${func.color};` : ''}">
                                ${func.name}
                            </option>
                        `).join('')}
                    </select>
                    ` : `
                    <div style="padding: 10px; background: var(--warning-light); border-radius: 6px; border-left: 3px solid var(--warning);">
                        <small style="color: var(--warning-dark); display: block; margin-bottom: 5px;">
                            <i class="fas fa-exclamation-triangle"></i> Nenhuma função cadastrada
                        </small>
                        ${this.isLeader() ? `
                        <button type="button" class="btn-link" onclick="churchTimeApp.loadFunctionsManagementScreen()" 
                                style="font-size: 0.8rem;">
                            <i class="fas fa-cog"></i> Cadastrar funções
                        </button>
                        ` : '<small>Contate um líder para cadastrar funções</small>'}
                    </div>
                    `}
                </div>
            </div>
        </div>`;
    });
    
    html += '</div>';
    
    membersContainer.html(html);
    
    // Configurar eventos (usando a mesma lógica da escala única)
    this.setupWizardMemberEvents(modal);
    
    // Atualizar contadores
    this.updateWizardMemberCounters(modal);
}

// Função específica para o wizard (não confunde com a principal)
updateWizardSelectedDates(modal, selectedDates) {
    const infoContainer = modal.find('#selectedDatesInfo');
    const listContainer = modal.find('#selectedDatesList');
    
    if (!selectedDates || selectedDates.length === 0) {
        infoContainer.hide();
        return;
    }
    
    // Ordenar datas
    selectedDates.sort();
    
    let listHtml = '<div style="display: flex; flex-wrap: wrap; gap: 5px;">';
    selectedDates.forEach(date => {
        const dateObj = new Date(date);
        listHtml += `
        <span class="date-chip" style="padding: 5px 10px; background: var(--primary-light); border-radius: 4px;">
            ${dateObj.getDate()}/${dateObj.getMonth() + 1}
        </span>`;
    });
    listHtml += '</div>';
    
    listContainer.html(listHtml);
    infoContainer.show();
}

setupWizardMemberEvents(modal) {
    // Habilitar/desabilitar select quando checkbox mudar
    modal.off('change', '.wizard-member-checkbox').on('change', '.wizard-member-checkbox', function() {
        const isChecked = $(this).is(':checked');
        const memberId = $(this).data('member-id');
        const functionSelect = modal.find(`.wizard-function-select[data-member-id="${memberId}"]`);
        
        functionSelect.prop('disabled', !isChecked);
        
        if (!isChecked) {
            functionSelect.val('');
        }
        
        // Atualizar contadores
        churchTimeApp.updateWizardMemberCounters(modal);
    });

    // Quando mudar a função, atualizar estilo
    modal.off('change', '.wizard-function-select').on('change', '.wizard-function-select', function() {
        const selectedOption = $(this).find('option:selected');
        const color = selectedOption.data('color');
        
        if (color) {
            $(this).css('border-left', `3px solid ${color}`);
        } else {
            $(this).css('border-left', '');
        }
        
        // Atualizar contadores
        churchTimeApp.updateWizardMemberCounters(modal);
    });
}

getRandomColor() {
    const colors = [
        '#9147ff', '#7B68EE', '#6A5ACD', '#483D8B', '#FF6B6B', '#FF8E6B',
        '#FFD166', '#06D6A0', '#4ECDC4', '#118AB2', '#073B4C', '#7209B7',
        '#F72585', '#4361EE', '#3A0CA3', '#4CC9F0'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}


updateWizardMemberCounters(modal) {
    const selectedCount = modal.find('.wizard-member-checkbox:checked').length;
    const assignedCount = modal.find('.wizard-function-select:enabled option:selected[value!=""]').length;
    
    modal.find('#selectedMembersCount').text(selectedCount);
    modal.find('#assignedFunctionsCount').text(assignedCount);
    
    // Habilitar/desabilitar botão próximo baseado em validação
    const nextBtn = modal.find('[data-next="4"]');
    if (selectedCount > 0 && assignedCount === selectedCount) {
        nextBtn.prop('disabled', false);
        modal.find('.selected-count').css('color', 'var(--success)');
    } else {
        nextBtn.prop('disabled', true);
        modal.find('.selected-count').css('color', 'var(--warning)');
    }
}
setupMonthlyScaleWizard(modal) {
    const self = this;
    let selectedDates = [];
    let selectedMembers = [];
    
    // Garantir que não está em modo edição
    modal.data('editMode', false);
    
    console.log('🛠️ Configurando wizard de CRIAÇÃO');
    
    // Navegação do wizard
    modal.find('.btn-next-step').click(function() {
        const nextStep = $(this).data('next');
        console.log('▶️ Próximo passo (criação):', nextStep);
        self.goToWizardStep(modal, nextStep);
    });
    
    modal.find('.btn-prev-step').click(function() {
        const prevStep = $(this).data('prev');
        console.log('◀️ Passo anterior (criação):', prevStep);
        self.goToWizardStep(modal, prevStep);
    });
    
    // Cancelar
    modal.find('#cancelMonthlyScale').click(() => modal.remove());
    
    // Quando mudar mês ou ministério (passo 1)
    modal.find('#monthlyScaleMonth, #monthlyScaleMinistry').change(async function() {
        const month = modal.find('#monthlyScaleMonth').val();
        const ministryId = modal.find('#monthlyScaleMinistry').val();
        
        if (month && ministryId) {
            // Limpar seleções anteriores
            selectedDates = [];
            
            // Carregar calendário
            await self.loadMonthCalendar(modal, month, ministryId);
            
            // Habilitar próximo botão do passo 2
            const nextBtnStep2 = modal.find('[data-next="3"]');
            nextBtnStep2.prop('disabled', true);
        }
    });
    
    // Configurar seleção de datas no calendário
    modal.on('click', '.calendar-day:not(.occupied):not(.past):not(.empty)', function() {
        const date = $(this).data('date');
        const isSelected = $(this).hasClass('selected');
        
        if (isSelected) {
            $(this).removeClass('selected');
            const index = selectedDates.indexOf(date);
            if (index > -1) selectedDates.splice(index, 1);
        } else {
            $(this).addClass('selected');
            selectedDates.push(date);
        }
        
        // Atualizar lista de datas selecionadas
        self.updateSelectedDatesList(modal, selectedDates);
        
        // Habilitar/desabilitar próximo botão
        const nextBtn = modal.find('[data-next="3"]');
        nextBtn.prop('disabled', selectedDates.length === 0);
    });
    
    // Criar escala mensal (passo 4)
    modal.find('#createMonthlyScaleBtn').click(async () => {
        // Coletar membros selecionados
        selectedMembers = [];
        modal.find('.member-checkbox:checked').each(function() {
            selectedMembers.push(parseInt($(this).val()));
        });
        
        await self.createMonthlyScale(modal, selectedDates, selectedMembers);
    });
}
async loadMonthCalendar(modal, month, ministryId) {
    try {
        // CORREÇÃO: Use o ID correto do container do wizard
        const container = modal.find('#wizardCalendarContainer');
        
        if (container.length === 0) {
            console.error('❌ Container #wizardCalendarContainer não encontrado!');
            // Tenta encontrar por classe como fallback
            const fallbackContainer = modal.find('.wizard-calendar-container');
            if (fallbackContainer.length > 0) {
                container = fallbackContainer;
                console.log('✅ Usando container por classe:', fallbackContainer);
            } else {
                console.error('❌ Nenhum container encontrado!');
                return;
            }
        }
        
        console.log('📦 Container encontrado:', container.selector || container.length);
        
        container.html(`
            <div class="loading-message" style="text-align: center; padding: 40px;">
                <div class="loading-spinner large"></div>
                <p style="margin-top: 15px; color: var(--text-secondary);">
                    Carregando calendário para ${month}...
                </p>
            </div>
        `);
        
        console.log('📅 Buscando calendário para:', { month, ministryId });
        
        // Chamada API
        const response = await this.apiCall('/api/scales/month-calendar', 'POST', {
            month_year: month,
            ministry_id: parseInt(ministryId)
        });
        
        console.log('✅ Resposta completa:', response);
        
        if (response && response.success) {
            const calendarData = response.data;
            console.log('🎯 Dados recebidos, renderizando...');
            
            // CORREÇÃO: Chama o método correto
            this.renderWizardCalendar(modal, calendarData);
            
        } else {
            console.error('❌ API retornou erro:', response);
            container.html(`
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro: ${response?.error || 'Erro desconhecido'}</p>
                </div>
            `);
        }
        
    } catch (error) {
        console.error('💥 Erro em loadMonthCalendar:', error);
        
        const container = modal.find('#wizardCalendarContainer');
        if (container.length > 0) {
            container.html(`
                <div class="error-container" style="text-align: center; padding: 30px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--danger);"></i>
                    <p style="color: var(--text-secondary); margin-top: 10px;">
                        Erro: ${error.message || 'Erro ao carregar calendário'}
                    </p>
                </div>
            `);
        }
    }
}


async loadWizardCalendar(modal, month, ministryId) {
    try {
        const container = modal.find('#wizardCalendarContainer');
        
        // Mostrar loading
        container.html(`
            <div style="text-align: center; padding: 40px;">
                <div class="loading-spinner large"></div>
                <p style="margin-top: 15px; color: var(--text-secondary);">
                    Carregando disponibilidade para ${month}...
                </p>
            </div>
        `);
        
        console.log('📅 Wizard - Chamando API...');
        
        // PRIMEIRO: Debug da API
        const debugResult = await this.debugCalendarAPI(month, ministryId);
        
        if (!debugResult) {
            throw new Error('API não retornou dados');
        }
        
        // SE A API ESTIVER RETORNANDO DADOS CORRETAMENTE
        if (debugResult.success) {
            console.log('✅ API retornou dados:', debugResult.data);
            
            // Renderizar calendário com dados da API
            this.renderWizardCalendarFromAPI(modal, debugResult.data);
            
        } else {
            // API retornou erro
            console.error('❌ API retornou erro:', debugResult.error);
            
            // Mostrar erro e fallback
            container.html(`
                <div class="api-error" style="text-align: center; padding: 30px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: var(--warning);"></i>
                    <h4 style="color: var(--warning); margin: 15px 0;">API Retornou Erro</h4>
                    <p style="color: var(--text-secondary); margin-bottom: 20px;">
                        ${debugResult.error || 'Erro desconhecido'}
                    </p>
                    <button class="btn btn-outline" onclick="churchTimeApp.loadStaticFallbackCalendar('${month}', ${ministryId})">
                        Usar Calendário Estático
                    </button>
                </div>
            `);
        }
        
    } catch (error) {
        console.error('💥 Erro em loadWizardCalendar:', error);
        
        // Fallback para calendário estático
        this.loadStaticFallbackCalendar(modal, month, ministryId);
    }
}

async renderWizardCalendar(modal, calendarData) {
    console.log('🎨 Renderizando calendário...');
    
    const container = modal.find('#wizardCalendarContainer');
    
    if (container.length === 0) {
        console.error('❌ Container não encontrado');
        return;
    }
    
    const monthName = calendarData.month_name;
    const year = calendarData.year;
    const availableCount = calendarData.available_count;
    const month = calendarData.month;
    
    // **CORREÇÃO 1: Cálculo correto do primeiro dia do mês**
    const firstDayOfMonth = new Date(year, month - 1, 1).getDay(); // 0=Dom, 1=Seg, ..., 6=Sáb
    const today = new Date().toISOString().split('T')[0];
    
    // **CORREÇÃO 2: Verificar quantos dias tem o mês**
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    console.log(`📅 Mês ${month}/${year} tem ${lastDayOfMonth} dias`);
    
    // Verificar se os dados da API estão corretos
    if (calendarData.calendar.length !== lastDayOfMonth) {
        console.warn(`⚠️ A API retornou ${calendarData.calendar.length} dias, mas o mês tem ${lastDayOfMonth} dias!`);
    }
    
    // USANDO CLASSES DO SEU CSS EXISTENTE
    let html = `
    <div class="calendar-container" style="margin-top: 20px;">
        <div class="calendar-header" style="text-align: center; margin-bottom: 20px;">
            <h4 style="margin: 0 0 5px 0; color: var(--text-primary);">${monthName} ${year}</h4>
            <small style="color: var(--text-secondary);">${availableCount} dias disponíveis</small>
        </div>
        
        <div class="calendar-weekdays" style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 10px; text-align: center;">
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Dom</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Seg</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Ter</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qua</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Qui</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sex</div>
            <div style="padding: 10px; font-weight: 600; color: var(--text-secondary);">Sáb</div>
        </div>
        
        <div class="calendar-days-grid" 
             style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;"
             id="wizardDaysGrid">
    `;
    
    // **CORREÇÃO 3: Dias vazios no início - domingo é 0, sábado é 6**
    for (let i = 0; i < firstDayOfMonth; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    // **CORREÇÃO 4: Renderizar todos os dias do mês, mesmo se a API não tiver todos**
    // Se a API não retornou todos os dias, completar manualmente
    for (let dayNumber = 1; dayNumber <= lastDayOfMonth; dayNumber++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
        
        // Buscar dados da API ou usar valores padrão
        let dayData = calendarData.calendar.find(d => {
            // Comparar datas de forma robusta
            const apiDate = new Date(d.date);
            const targetDate = new Date(dateStr);
            return apiDate.getDate() === targetDate.getDate() && 
                   apiDate.getMonth() === targetDate.getMonth() &&
                   apiDate.getFullYear() === targetDate.getFullYear();
        });
        
        // Se não encontrou na API, criar dados padrão
        if (!dayData) {
            console.warn(`⚠️ Dia ${dayNumber} não encontrado na API, usando dados padrão`);
            dayData = {
                date: dateStr,
                day: dayNumber,
                is_occupied: false,
                is_past: dateStr < today,
                is_today: dateStr === today
            };
        }
        
        const dateStrClean = dayData.date;
        const isOccupied = dayData.is_occupied || false;
        const isPast = dayData.is_past || (dateStr < today);
        const isToday = dateStrClean === today;
        
        // Determinar classes e estilos
        let dayClass = 'calendar-day';
        let dayStyle = `
            padding: 12px 5px;
            text-align: center;
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            position: relative;
            min-height: 60px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            border: 2px solid transparent;
        `;
        
        if (isOccupied) {
            dayClass += ' occupied';
            dayStyle += `
                background: var(--danger-light) !important;
                color: var(--danger) !important;
                cursor: not-allowed !important;
                opacity: 0.7;
            `;
        } else if (isPast) {
            dayClass += ' past';
            dayStyle += `
                background: var(--secondary) !important;
                color: var(--text-tertiary) !important;
                cursor: not-allowed !important;
                opacity: 0.5;
            `;
        } else {
            dayStyle += `
                background: var(--card-bg);
                color: var(--text-primary);
                border-color: var(--border);
            `;
        }
        
        if (isToday) {
            dayClass += ' today';
            dayStyle += `
                border-color: var(--primary) !important;
                background: var(--primary-light) !important;
                font-weight: bold;
            `;
        }
        
        html += `
        <div class="${dayClass}" 
             data-date="${dateStrClean}"
             data-day="${dayNumber}"
             data-occupied="${isOccupied}"
             data-past="${isPast}"
             style="${dayStyle}"
             title="${isOccupied ? 'Ocupado' : isPast ? 'Data passada' : 'Clique para selecionar'}">
            <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 5px;">${dayNumber}</div>
            ${isOccupied ? '<div style="position: absolute; top: 5px; right: 5px; color: var(--danger); font-size: 0.8rem;">✗</div>' : ''}
            ${isToday ? '<div style="font-size: 0.7rem; color: var(--primary);">Hoje</div>' : ''}
        </div>`;
    }
    
    // **CORREÇÃO 5: Completar células até completar semanas completas**
    const totalCellsSoFar = firstDayOfMonth + lastDayOfMonth;
    const cellsNeeded = Math.ceil(totalCellsSoFar / 7) * 7;
    const remainingCells = cellsNeeded - totalCellsSoFar;
    
    console.log(`📊 Células: inicial=${firstDayOfMonth}, dias=${lastDayOfMonth}, total=${totalCellsSoFar}, necessário=${cellsNeeded}, restante=${remainingCells}`);
    
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-day empty" style="background: transparent;"></div>';
    }
    
    html += `
        </div>
        
        <div class="calendar-legend" style="margin-top: 20px; display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--card-bg); border: 2px solid var(--border); border-radius: 3px;"></div>
                <small>Disponível</small>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--danger-light); border-radius: 3px;"></div>
                <small>Ocupado</small>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--primary-light); border: 2px solid var(--primary); border-radius: 3px;"></div>
                <small>Hoje</small>
            </div>
            <div style="display: flex; align-items: center; gap: 5px;">
                <div style="width: 15px; height: 15px; background: var(--warning-light); border: 2px solid var(--warning); border-radius: 3px;"></div>
                <small>Selecionado</small>
            </div>
        </div>
        
        <div class="calendar-instructions" style="margin-top: 15px; padding: 10px; background: var(--card-bg); border-radius: 8px; text-align: center;">
            <small style="color: var(--text-secondary);">
                <i class="fas fa-mouse-pointer"></i> Clique nas datas disponíveis para selecionar
            </small>
        </div>
    </div>`;
    
    // IMPORTANTE: Substituir o conteúdo do container
    container.html(html);
    console.log('✅ Calendário renderizado com', lastDayOfMonth, 'dias');
    
    // CONFIGURAR EVENT LISTENERS PARA INTERAÇÃO
    this.setupWizardCalendarInteractions(modal);
}


setupWizardCalendarInteractions(modal) {
    console.log('🔧 Configurando interações do calendário...');
    
    const daysGrid = modal.find('#wizardDaysGrid');
    const nextBtn = modal.find('[data-next="3"]');
    
    if (daysGrid.length === 0) {
        console.error('❌ Grid de dias não encontrado');
        return;
    }
    
    // Remover listeners antigos
    daysGrid.off('click', '.calendar-day');
    
    // Adicionar novo listener para seleção
    daysGrid.on('click', '.calendar-day:not(.occupied):not(.past):not(.empty)', function(e) {
        e.stopPropagation();
        
        const $this = $(this);
        const dateStr = $this.attr('data-date'); // ex: "2026-01-29"
        
        // **CORREÇÃO: NÃO SUBTRAIR 1 DIA!**
        // A data já está correta no formato YYYY-MM-DD
        const date = dateStr; // Usar a data diretamente
        
        console.log('📅 Clique na data:', date, 'Data original:', dateStr);
        
        const isSelected = $this.hasClass('selected');
        
        if (isSelected) {
            // Desselecionar
            $this.removeClass('selected');
            $this.css({
                'background': '',
                'border-color': '',
                'transform': '',
                'box-shadow': ''
            });
        } else {
            // Selecionar
            $this.addClass('selected');
            $this.css({
                'background': 'var(--warning-light)',
                'border-color': 'var(--warning)',
                'color': 'var(--warning-dark)',
                'transform': 'scale(1.05)',
                'box-shadow': '0 0 0 3px rgba(255, 193, 7, 0.3)'
            });
        }
        
        // Contar datas selecionadas
        const selectedCount = daysGrid.find('.calendar-day.selected').length;
        console.log('🎯 Total selecionado:', selectedCount);
        
        // Atualizar botão próximo
        if (nextBtn.length > 0) {
            const shouldEnable = selectedCount > 0;
            nextBtn.prop('disabled', !shouldEnable);
            
            if (shouldEnable) {
                nextBtn.css({
                    'opacity': '1',
                    'cursor': 'pointer'
                });
            } else {
                nextBtn.css({
                    'opacity': '0.6',
                    'cursor': 'not-allowed'
                });
            }
        }
        
        // Coletar datas selecionadas
        const selectedDates = [];
        daysGrid.find('.calendar-day.selected').each(function() {
            // **CORREÇÃO: Usar data original, sem modificações**
            selectedDates.push($(this).attr('data-date'));
        });
        
        console.log('📋 Datas selecionadas:', selectedDates);
        
        // Atualizar UI das datas selecionadas
        churchTimeApp.updateWizardSelectedDates(modal, selectedDates);
    });
    
    // Adicionar efeito hover
    daysGrid.on('mouseenter', '.calendar-day:not(.occupied):not(.past):not(.empty):not(.selected)', function() {
        $(this).css({
            'transform': 'translateY(-2px)',
            'box-shadow': '0 4px 8px rgba(0,0,0,0.1)'
        });
    });
    
    daysGrid.on('mouseleave', '.calendar-day:not(.occupied):not(.past):not(.empty):not(.selected)', function() {
        $(this).css({
            'transform': '',
            'box-shadow': ''
        });
    });
    
    console.log('✅ Interações configuradas');
}
updateWizardSelectedDates(modal, selectedDates) {
    const infoContainer = modal.find('#selectedDatesInfo');
    const listContainer = modal.find('#selectedDatesList');
    
    if (selectedDates.length === 0) {
        infoContainer.hide();
        return;
    }
    console.log('teste data: '+selectedDates);
    // Ordenar datas
    selectedDates.sort();
    
    let listHtml = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
    
    selectedDates.forEach(date => {
        try {
           const [y, m, d] = date.split('-');
	const dateObj = new Date(y, m - 1, d);

	const day = String(dateObj.getDate()).padStart(2, '0');
	const month = String(dateObj.getMonth() + 1).padStart(2, '0');

	console.log(`bug da vassoura resolvido: ${day}/${month}`);
            console.log('bug da vassoura: '+day);
            listHtml += `
            <div class="date-chip" style="
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--warning-light);
                color: var(--warning-dark);
                border: 1px solid var(--warning);
                border-radius: 20px;
                font-size: 0.9rem;
                font-weight: 500;
            ">
                <span>${day}/${month}</span>
                <button class="remove-date-btn" 
                        data-date="${date}"
                        style="
                            background: none;
                            border: none;
                            color: var(--warning-dark);
                            cursor: pointer;
                            font-size: 1.2rem;
                            padding: 0;
                            width: 20px;
                            height: 20px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            border-radius: 50%;
                        "
                        onmouseover="this.style.background='var(--warning)'"
                        onmouseout="this.style.background='none'"
                        title="Remover data">
                    ×
                </button>
            </div>`;
        } catch (error) {
            console.error('❌ Erro ao processar data:', date, error);
        }
    });
    
    listHtml += '</div>';
    
    listContainer.html(listHtml);
    infoContainer.show();
    
    // Configurar botões de remover
    listContainer.off('click', '.remove-date-btn').on('click', '.remove-date-btn', function(e) {
        e.stopPropagation();
        const dateToRemove = $(this).data('date');
        
        // Remover seleção visual
        modal.find(`.calendar-day[data-date="${dateToRemove}"]`).removeClass('selected').css({
            'background': '',
            'border-color': '',
            'transform': '',
            'box-shadow': ''
        });
        
        // Recalcular
        const newSelectedDates = [];
        modal.find('.calendar-day.selected').each(function() {
            newSelectedDates.push($(this).data('date'));
        });
        
        churchTimeApp.updateWizardSelectedDates(modal, newSelectedDates);
    });
}

renderWizardSpecificCalendar(modal, calendarData) {
    const container = modal.find('#wizardCalendar');
    const selectedDates = [];
    
    let html = `
    <div class="wizard-calendar-inner">
        <div class="wizard-calendar-header">
            <h4>${calendarData.month_name} ${calendarData.year}</h4>
            <small class="wizard-hint">Clique nas datas disponíveis</small>
        </div>
        
        <div class="wizard-weekdays">
            <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
        </div>
        
        <div class="wizard-days-grid">`;
    
    // Primeiro dia do mês
    const firstDay = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
    
    // Dias vazios
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        html += '<div class="wizard-day empty"></div>';
    }
    
    // Dias do mês
    calendarData.calendar.forEach(day => {
        const isOccupied = day.is_occupied;
        const isPast = day.is_past;
        
        let dayClass = 'wizard-day';
        if (isOccupied) dayClass += ' wizard-occupied';
        if (isPast) dayClass += ' wizard-past';
        
        html += `
        <div class="${dayClass}" 
             data-wizard-date="${day.date}" 
             data-occupied="${isOccupied}"
             data-past="${isPast}"
             title="${isOccupied ? 'Ocupado' : isPast ? 'Passado' : 'Disponível'}">
            <div class="wizard-day-number">${day.day}</div>
            ${isOccupied ? '<div class="wizard-occupied-icon">✗</div>' : ''}
        </div>`;
    });
    
    html += `
        </div>
        
        <div class="wizard-legend">
            <span><span class="wizard-legend-dot available"></span> Disponível</span>
            <span><span class="wizard-legend-dot occupied"></span> Ocupado</span>
            <span><span class="wizard-legend-dot selected"></span> Selecionado</span>
        </div>
    </div>`;
    
    container.html(html);
    
    // 🔥 LISTENER ESPECÍFICO APENAS para o wizard
    this.setupWizardCalendarSelection(modal, selectedDates);
}

// Método fallback estático (se a API falhar)
async loadStaticFallbackCalendar(modal, month, ministryId) {
    console.log('🔄 Usando fallback estático...');
    
    const container = modal.find('#wizardCalendarContainer');
    
    // Simular dados da API localmente
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const today = new Date().toISOString().split('T')[0];
    
    const fakeCalendarData = {
        month_name: new Date(year, monthNum - 1).toLocaleDateString('pt-BR', { month: 'long' }),
        year: parseInt(year),
        month: parseInt(monthNum),
        calendar: []
    };
    
    // Gerar dias com alguma lógica básica
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${monthNum.padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        const dateObj = new Date(dateStr);
        const dayOfWeek = dateObj.getDay();
        
        // Lógica: ocupado às segundas (1) e quintas (4)
        const isOccupied = dayOfWeek === 1 || dayOfWeek === 4;
        const isPast = dateStr < today;
        const isToday = dateStr === today;
        
        fakeCalendarData.calendar.push({
            date: dateStr,
            day: day,
            day_of_week: dayOfWeek,
            is_occupied: isOccupied,
            is_past: isPast,
            is_today: isToday,
            event: isOccupied ? (dayOfWeek === 1 ? 'Reunião' : 'Ensaios') : null
        });
    }
    
    console.log('📅 Fallback gerado:', fakeCalendarData);
    this.renderWizardCalendarFromAPI(modal, fakeCalendarData);
}


renderSimpleCalendar(modal, month, ministryId, calendarData = null) {
    const container = modal.find('#monthCalendarContainer');
    const [year, monthNum] = month.split('-');
    const monthIndex = parseInt(monthNum) - 1;
    
    // Se temos dados da API, usar eles
    if (calendarData) {
        console.log('🎯 Renderizando calendário com dados da API:', calendarData);
        
        const monthName = calendarData.month_name || 
                         new Date(year, monthIndex).toLocaleDateString('pt-BR', { 
                             month: 'long', 
                             year: 'numeric' 
                         });
        
        let html = `
        <div class="simple-calendar">
            <div class="calendar-header">
                <h4>${monthName}</h4>
                <small style="color: var(--text-secondary);">
                    <i class="fas fa-info-circle"></i> 
                    ${calendarData.available_count} dias disponíveis
                </small>
            </div>
            
            <div class="calendar-weekdays">
                <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            
            <div class="calendar-days-grid">`;
        
        // Dias vazios no início
        const firstDay = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
        for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
            html += '<div class="calendar-day empty"></div>';
        }
        
        // Dias do mês a partir dos dados da API
        const today = new Date().toISOString().split('T')[0];
        
        calendarData.calendar.forEach(day => {
            const dateStr = day.date;
            const isOccupied = day.is_occupied;
            const isPast = day.is_past;
            const isToday = dateStr === today;
            
            let dayClass = 'calendar-day';
            if (isOccupied) dayClass += ' occupied';
            if (isPast) dayClass += ' past';
            if (isToday) dayClass += ' today';
            
            html += `
            <div class="${dayClass}" data-date="${dateStr}" 
                 ${isPast ? 'style="opacity: 0.5; cursor: not-allowed;"' : 'style="cursor: pointer;"'}
                 ${isPast ? 'title="Data passada"' : isOccupied ? 'title="Data ocupada"' : 'title="Clique para selecionar"'}>
                <div class="day-number">${day.day}</div>
                ${isToday ? '<div class="day-today">Hoje</div>' : ''}
                ${!isOccupied && !isPast ? '<div class="day-selector"></div>' : ''}
            </div>`;
        });
        
        html += `
            </div>
        </div>`;
        
        container.html(html);
        
    } else {
        // Código original para fallback (sem dados da API)
        const monthName = new Date(year, monthIndex).toLocaleDateString('pt-BR', { 
            month: 'long', 
            year: 'numeric' 
        });
        
        let html = `
        <div class="simple-calendar">
            <div class="calendar-header">
                <h4>${monthName}</h4>
                <small style="color: var(--text-secondary);">
                    <i class="fas fa-info-circle"></i> Selecione as datas disponíveis
                </small>
            </div>
            
            <div class="calendar-weekdays">
                <div>Dom</div><div>Seg</div><div>Ter</div><div>Qua</div><div>Qui</div><div>Sex</div><div>Sáb</div>
            </div>
            
            <div class="calendar-days-grid">`;
        
        // Resto do seu código original para fallback...
        // ...
    }
    
    // Configurar eventos de seleção (mantenha seu código existente)
    const self = this;
    container.off('click', '.calendar-day:not(.past):not(.empty)');
    container.on('click', '.calendar-day:not(.past):not(.empty)', function() {
        const date = $(this).data('date');
        const isSelected = $(this).hasClass('selected');
        
        if (isSelected) {
            $(this).removeClass('selected');
        } else {
            $(this).addClass('selected');
        }
        
        // Coletar datas selecionadas
        const selectedDates = [];
        container.find('.calendar-day.selected').each(function() {
            selectedDates.push($(this).data('date'));
        });
        
        // Atualizar lista de datas selecionadas
        self.updateSelectedDatesList(modal, selectedDates);
        
        // Habilitar/desabilitar botão próximo
        const nextBtn = modal.find('[data-next="3"]');
        nextBtn.prop('disabled', selectedDates.length === 0);
    });
}
setupWizardCalendarSelection(modal) {
    const container = modal.find('#wizardDaysGrid');
    const nextBtn = modal.find('[data-next="3"]');
    const selectedDates = [];
    
    // Limpar listeners antigos
    container.off('click', '.wizard-day');
    
    // Novo listener
    container.on('click', '.wizard-day:not(.wizard-occupied):not(.wizard-past):not(.empty)', function() {
        const date = $(this).data('date');
        const isSelected = $(this).hasClass('selected');
        
        if (isSelected) {
            $(this).removeClass('selected');
            const index = selectedDates.indexOf(date);
            if (index > -1) selectedDates.splice(index, 1);
        } else {
            $(this).addClass('selected');
            selectedDates.push(date);
        }
        
        // Atualizar UI
        updateSelectedDatesUI();
        
        // Habilitar/desabilitar botão próximo
        nextBtn.prop('disabled', selectedDates.length === 0);
        
        console.log('📅 Wizard - Datas selecionadas:', selectedDates);
    });
    
    const updateSelectedDatesUI = () => {
        const infoContainer = modal.find('#selectedDatesInfo');
        const listContainer = modal.find('#selectedDatesList');
        
        if (selectedDates.length === 0) {
            infoContainer.hide();
            return;
        }
        
        let html = '<div class="dates-grid">';
        selectedDates.sort().forEach(date => {
            const d = new Date(date);
            html += `
            <div class="date-chip">
                <span>${d.getDate()}/${d.getMonth() + 1}</span>
                <button class="remove-date" data-date="${date}">×</button>
            </div>`;
        });
        html += '</div>';
        
        listContainer.html(html);
        infoContainer.show();
        
        // Remover datas
        listContainer.find('.remove-date').click(function() {
            const dateToRemove = $(this).data('date');
            const index = selectedDates.indexOf(dateToRemove);
            
            if (index > -1) {
                selectedDates.splice(index, 1);
                container.find(`.wizard-day[data-date="${dateToRemove}"]`).removeClass('selected');
                updateSelectedDatesUI();
                nextBtn.prop('disabled', selectedDates.length === 0);
            }
        });
    };
}
async debugCalendarAPI(month, ministryId) {
    try {
        console.log('🔍 Debug API - Parâmetros:', { month, ministryId });
        
        // Testar a rota diretamente
        const response = await fetch(`${this.baseURL}/api/scales/month-calendar`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.data.currentUser?.token}`
            },
            body: JSON.stringify({
                month_year: month,
                ministry_id: parseInt(ministryId)
            })
        });
        
        console.log('📊 Resposta bruta:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });
        
        // Tentar ler como texto primeiro
        const textResponse = await response.text();
        console.log('📄 Resposta como texto:', textResponse.substring(0, 500));
        
        // Tentar parsear como JSON
        try {
            const jsonResponse = JSON.parse(textResponse);
            console.log('✅ JSON parseado:', jsonResponse);
            return jsonResponse;
        } catch (jsonError) {
            console.error('❌ Não é JSON válido:', jsonError);
            return null;
        }
        
    } catch (error) {
        console.error('💥 Erro no debug:', error);
        return null;
    }
}
    
    updateWizardDatesList(dates) {
        const infoContainer = modal.find('#selectedDatesInfo');
        const listContainer = modal.find('#selectedDatesList');
        
        if (dates.length === 0) {
            infoContainer.hide();
            return;
        }
        
        let html = '<div class="wizard-dates-chips">';
        dates.forEach(date => {
            const d = new Date(date);
            html += `
            <span class="wizard-date-chip">
                ${d.getDate()}/${d.getMonth() + 1}
            </span>`;
        });
        html += '</div>';
        
        listContainer.html(html);
        infoContainer.show();
    }

// Método alternativo para entrada manual de datas
manualCalendarEntry() {
    const modal = $('.modal').first();
    const container = modal.find('#monthCalendarContainer');
    
    const month = modal.find('#monthlyScaleMonth').val();
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    
    let html = `
    <div class="manual-calendar">
        <div class="manual-header">
            <h4>Seleção Manual de Datas - ${new Date(year, monthNum-1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h4>
            <p style="color: var(--text-secondary);">Marque os dias da semana desejados:</p>
        </div>
        
        <div class="weekday-selector" style="margin: 20px 0;">
            ${['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'].map((day, index) => `
                <label style="display: inline-block; margin: 5px; padding: 8px 15px; border: 1px solid var(--border); border-radius: 6px; cursor: pointer;">
                    <input type="checkbox" class="weekday-checkbox" value="${index}">
                    ${day}
                </label>
            `).join('')}
        </div>
        
        <div class="selected-dates-preview" id="manualDatesPreview" style="margin: 20px 0; padding: 15px; background: var(--card-bg); border-radius: 8px; display: none;">
            <h5>Datas Selecionadas:</h5>
            <div id="manualDatesList"></div>
        </div>
        
        <div class="manual-actions">
            <button class="btn btn-primary" id="generateManualDates">
                <i class="fas fa-calendar-check"></i> Gerar Datas
            </button>
            <button class="btn btn-outline" onclick="churchTimeApp.loadMonthCalendar(
                $(this).closest('.modal'),
                $('#monthlyScaleMonth').val(),
                $('#monthlyScaleMinistry').val()
            )">
                <i class="fas fa-undo"></i> Voltar para Calendário Automático
            </button>
        </div>
    </div>`;
    
    container.html(html);
    
    modal.find('#generateManualDates').click(() => {
        const selectedWeekdays = [];
        modal.find('.weekday-checkbox:checked').each(function() {
            selectedWeekdays.push(parseInt($(this).val()));
        });
        
        if (selectedWeekdays.length === 0) {
            this.showToast('Selecione pelo menos um dia da semana', 'error');
            return;
        }
        
        // Gerar datas do mês baseadas nos dias da semana selecionados
        const selectedDates = [];
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, monthNum - 1, day);
            if (selectedWeekdays.includes(date.getDay())) {
                const dateStr = date.toISOString().split('T')[0];
                selectedDates.push(dateStr);
            }
        }
        
        this.updateSelectedDatesList(modal, selectedDates);
        
        // Habilitar próximo botão
        modal.find('[data-next="3"]').prop('disabled', selectedDates.length === 0);
        
        this.showToast(`${selectedDates.length} datas geradas com sucesso!`, 'success');
    });
}

renderMonthCalendar(modal, calendarData) {
    const container = modal.find('#monthCalendarContainer');
    const selectedDates = [];
    
    let html = `
    <div class="month-calendar-wrapper">
        <div class="calendar-header">
            <h4>${calendarData.month_name} ${calendarData.year}</h4>
            <div class="calendar-legend">
                <div class="legend-item">
                    <div class="legend-color available"></div>
                    <span>Disponível</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color occupied"></div>
                    <span>Ocupado</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color selected"></div>
                    <span>Selecionado</span>
                </div>
            </div>
        </div>
        
        <div class="calendar-weekdays">
            <div>Seg</div>
            <div>Ter</div>
            <div>Qua</div>
            <div>Qui</div>
            <div>Sex</div>
            <div>Sáb</div>
            <div>Dom</div>
        </div>
        
        <div class="calendar-grid">
    `;
    
    // Adicionar dias vazios no início
    const firstDay = new Date(calendarData.year, calendarData.month - 1, 1).getDay();
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
        html += '<div class="calendar-day empty"></div>';
    }
    
    // Adicionar dias do mês
    calendarData.calendar.forEach(day => {
        const isOccupied = day.is_occupied;
        const isPast = day.is_past;
        const isToday = day.is_today;
        
        let dayClass = 'calendar-day';
        if (isOccupied) dayClass += ' occupied';
        if (isPast) dayClass += ' past';
        if (isToday) dayClass += ' today';
        
        let eventInfo = '';
        if (isOccupied && day.event) {
            eventInfo = `<div class="day-event" title="${day.event} ${day.time || ''}">${day.event.substring(0, 10)}${day.event.length > 10 ? '...' : ''}</div>`;
        }
        
        html += `
        <div class="${dayClass}" data-date="${day.date}" 
             ${isOccupied ? 'title="Data ocupada: ' + day.event + '"' : ''}
             ${isPast ? 'style="opacity: 0.5;"' : ''}>
            <div class="day-number">${day.day}</div>
            ${eventInfo}
            ${!isOccupied && !isPast ? '<div class="day-selector"></div>' : ''}
        </div>`;
    });
    
    html += `
        </div>
        <div class="calendar-info">
            <p><i class="fas fa-info-circle"></i> Clique nas datas disponíveis para selecionar</p>
            <p><strong>${calendarData.available_count} dias disponíveis</strong> de ${calendarData.calendar.length}</p>
        </div>
    </div>`;
    
    container.html(html);
    
    // Event listeners para seleção de datas
    container.off('click', '.calendar-day:not(.occupied):not(.past):not(.empty)');
    container.on('click', '.calendar-day:not(.occupied):not(.past):not(.empty)', function() {
        const date = $(this).data('date');
        const isSelected = $(this).hasClass('selected');
        
        if (isSelected) {
            $(this).removeClass('selected');
            const index = selectedDates.indexOf(date);
            if (index > -1) selectedDates.splice(index, 1);
        } else {
            $(this).addClass('selected');
            selectedDates.push(date);
        }
        
        // Atualizar lista de datas selecionadas
        self.updateSelectedDatesList(modal, selectedDates);
        
        // Habilitar/desabilitar próximo botão
        const nextBtn = modal.find('[data-next="3"]');
        nextBtn.prop('disabled', selectedDates.length === 0);
    });
}

updateSelectedDatesList(modal, selectedDates) {
    const infoContainer = modal.find('#selectedDatesInfo');
    const listContainer = modal.find('#selectedDatesList');
    
    if (selectedDates.length === 0) {
        infoContainer.hide();
        return;
    }
    
    // Ordenar datas
    selectedDates.sort();
    
    let listHtml = '<div class="dates-grid">';
    selectedDates.forEach(date => {
        const dateObj = new Date(date);
        listHtml += `
        <div class="date-chip">
            <span>${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}</span>
            <button class="remove-date" data-date="${date}">&times;</button>
        </div>`;
    });
    listHtml += '</div>';
    
    listContainer.html(listHtml);
    infoContainer.show();
    
    // Remover datas
    modal.find('.remove-date').click(function() {
        const dateToRemove = $(this).data('date');
        const index = selectedDates.indexOf(dateToRemove);
        if (index > -1) {
            selectedDates.splice(index, 1);
            
            // Remover seleção visual
            modal.find(`.calendar-day[data-date="${dateToRemove}"]`).removeClass('selected');
            
            // Atualizar lista
            self.updateSelectedDatesList(modal, selectedDates);
        }
    });
}

// CORREÇÃO: Mantenha o step como string ou ajuste todos os cases
goToWizardStep(modal, step) {
    console.log('==========================================');
    console.log('🚀 NAVEGAÇÃO WIZARD - Indo para passo:', step);
    console.log('Modo edição:', modal.data('editMode') ? 'SIM' : 'NÃO');
    
    // Verificar se modal ainda existe
    if (!modal || modal.length === 0) {
        console.error('❌ Modal não encontrado');
        return;
    }
    
    // Ocultar todos os passos
    modal.find('.wizard-step-content').removeClass('active');
    modal.find('.wizard-step').removeClass('active');
    
    // Mostrar passo atual
    modal.find(`[data-step="${step}"]`).addClass('active');
    modal.find(`.wizard-step-content[data-step="${step}"]`).addClass('active');
    
    // Rolar para o topo do conteúdo
    modal.find('.modal-content').scrollTop(0);
    
    // Comportamento específico para cada passo
    switch(step.toString()) {
        case '1':
            console.log('📋 Passo 1 - Mês e Ministério (bloqueado)');
            break;
            
        case '2':
            console.log('📋 Passo 2 - Selecionar Datas');
            this.handleStep2ForEdit(modal);
            break;
            
        case '3':
        console.log('🎯 PASSO 3 - Membros e Detalhes');
        
        // VERIFICAR SE É MODO EDIÇÃO OU CRIAÇÃO
        const isEditMode = modal.data('editMode') || false;
        console.log('Modo:', isEditMode ? 'EDIÇÃO' : 'CRIAÇÃO');
        
        if (isEditMode) {
            // MODO EDIÇÃO
            this.handleStep3ForEdit(modal);
        } else {
            // MODO CRIAÇÃO (original)
            this.handleStep3ForCreation(modal);
        }
        break;
            
        case '4':
            console.log('📋 Passo 4 - Revisão');
            this.handleStep4ForEdit(modal);
            break;
            
        default:
            console.warn('⚠️ Passo desconhecido:', step);
    }
}

handleStep3ForCreation(modal) {
    console.log('👥 Processando passo 3 - Membros (criação)');
    
    // Coletar datas selecionadas do calendário
    const selectedDates = [];
    modal.find('.calendar-day.selected').each(function() {
        selectedDates.push($(this).data('date'));
    });
    
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    
    console.log('📊 Dados para passo 3 (criação):', {
        ministry: ministryId,
        datesCount: selectedDates.length,
        dates: selectedDates
    });
    
    if (ministryId && selectedDates.length > 0) {
        // Renderizar escalas por data para criação
        this.renderDatesMembersSections(modal);
        
        // Atualizar status
        modal.find('#membersLoadingStatus').html(
            `<i class="fas fa-check-circle" style="color: var(--success);"></i> 
            ${selectedDates.length} data(s) para escalar`
        );
    } else {
        let errorMsg = '';
        if (!ministryId) errorMsg += 'Selecione um ministério. ';
        if (selectedDates.length === 0) errorMsg += 'Selecione pelo menos uma data.';
        
        modal.find('#membersLoadingStatus').html(
            `<i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i> ${errorMsg}`
        );
        
        modal.find('#datesMembersContainer').html(`
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                ${errorMsg}
                <button class="btn btn-sm btn-outline" onclick="churchTimeApp.goToWizardStep($(this).closest('.modal'), '${!ministryId ? '1' : '2'}')" style="margin-top: 10px;">
                    Voltar ao Passo ${!ministryId ? '1' : '2'}
                </button>
            </div>
        `);
    }
}

// HANDLER PARA PASSO 2 (DATAS BLOQUEADAS - RESPONSIVO)
handleStep2ForEdit(modal) {
    console.log('📅 Processando passo 2 - Datas (bloqueadas)');
    
    // Obter dados de forma segura
    const groupData = this.getGroupDataSafely(modal);
    const dates = groupData.dates || [];
    
    console.log(`📊 ${dates.length} datas encontradas`);
    
    // Atualizar contadores
    this.updateSummaryCounters(modal);
    
    // Atualizar título
    modal.find('.dates-count').text(`(${dates.length})`);
    
    // Habilitar botão próximo
    modal.find('[data-next="3"]').prop('disabled', false);
    
    // Ajustar layout
    this.adjustLayoutForScreenSize(modal);
}
// ATUALIZAR CONTADORES DO RESUMO
updateSummaryCounters(modal) {
    try {
        const groupData = modal.data('editGroupData');
        if (!groupData) {
            console.warn('⚠️ groupData não disponível');
            return;
        }
        
        // 1. Contador de datas
        const datesCount = groupData.dates?.length || 0;
        modal.find('#dates-count').text(datesCount);
        
        // 2. Contador de membros únicos
        const uniqueMembers = new Set();
        const selections = groupData.selections || {};
        Object.values(selections).forEach(dateData => {
            if (dateData.members) {
                Object.keys(dateData.members).forEach(memberId => {
                    uniqueMembers.add(memberId);
                });
            }
        });
        modal.find('#members-count').text(uniqueMembers.size);
        
        // 3. Contador de músicas (se existir)
        const songsCounter = modal.find('#songs-count');
        if (songsCounter.length) {
            let totalSongs = 0;
            Object.values(selections).forEach(dateData => {
                if (dateData.songs) {
                    totalSongs += dateData.songs.length;
                }
            });
            songsCounter.text(totalSongs);
        }
        
        console.log('✅ Contadores atualizados:', {
            dates: datesCount,
            members: uniqueMembers.size,
            songs: songsCounter.length ? totalSongs : 'N/A'
        });
        
    } catch (error) {
        console.error('❌ Erro ao atualizar contadores:', error);
    }
}

getGroupDataSafely(modal) {
    // Tentar várias fontes possíveis
    let groupData = modal.data('editGroupData') || 
                    modal.data('groupData') || 
                    modal.data('originalData');
    
    if (!groupData) {
        // Tentar obter do modal aberto
        const activeModal = $('.modal.active, .modal:visible').first();
        if (activeModal.length) {
            groupData = activeModal.data('editGroupData');
        }
    }
    
    if (!groupData) {
        console.warn('⚠️ Não foi possível obter groupData');
        return {
            dates: [],
            selections: {},
            ministry_id: null
        };
    }
    
    return groupData;
}

updateOtherCounters(modal, groupData) {
    // Contador de membros únicos
    const uniqueMembers = new Set();
    const selections = groupData.selections || {};
    Object.values(selections).forEach(dateData => {
        if (dateData.members) {
            Object.keys(dateData.members).forEach(memberId => {
                uniqueMembers.add(memberId);
            });
        }
    });
    
    // Atualizar contador de membros
    modal.find('.summary-item:nth-child(2) .summary-value').text(uniqueMembers.size);
    
    // Contador de músicas (se for ministério de louvor)
    let totalSongs = 0;
    Object.values(selections).forEach(dateData => {
        if (dateData.songs) {
            totalSongs += dateData.songs.length;
        }
    });
    
    // Atualizar contador de músicas
    const songsCounter = modal.find('.summary-item:nth-child(3) .summary-value');
    if (songsCounter.length) {
        songsCounter.text(totalSongs);
    }
}

// AJUSTAR LAYOUT BASEADO NO TAMANHO DA TELA
adjustLayoutForScreenSize(modal) {
    const updateLayout = () => {
        const width = window.innerWidth;
        const datesGrid = modal.find('.dates-grid');
        const featuresList = modal.find('.features-list');
        
        if (width < 480) {
            // Mobile pequeno
            datesGrid.css('grid-template-columns', 'repeat(2, 1fr)');
            featuresList.css('grid-template-columns', '1fr');
        } else if (width < 768) {
            // Tablet
            datesGrid.css('grid-template-columns', 'repeat(auto-fill, minmax(120px, 1fr))');
            featuresList.css('grid-template-columns', '1fr');
        } else {
            // Desktop
            datesGrid.css('grid-template-columns', 'repeat(auto-fill, minmax(140px, 1fr))');
            featuresList.css('grid-template-columns', 'repeat(auto-fit, minmax(250px, 1fr))');
        }
    };
    
    // Executar ao carregar e redimensionar
    updateLayout();
    $(window).on('resize.edit-step2', updateLayout);
    
    // Remover listener quando modal fechar
    modal.on('remove', () => {
        $(window).off('resize.edit-step2');
    });
}

// HANDLER PARA PASSO 3 (MEMBROS)
handleStep3ForEdit(modal) {
    console.log('👥 Processando passo 3 - Membros');
    
    const selections = modal.data('scaleSelections') || {};
    const dates = Object.keys(selections).sort();
    
    console.log('Datas com seleções:', dates.length);
    
    if (dates.length === 0) {
        console.error('❌ Nenhuma data com seleções encontrada');
        modal.find('#membersLoadingStatus').html(
            `<i class="fas fa-exclamation-triangle" style="color: var(--danger);"></i> 
            Nenhuma data encontrada. Volte ao passo anterior.`
        );
        return;
    }
    
    // Renderizar seções de membros
    this.renderDatesMembersSectionsForEdit(modal, selections);
}

// HANDLER PARA PASSO 4 (REVISÃO)
handleStep4ForEdit(modal) {
    console.log('📋 Processando passo 4 - Revisão');
    this.updateReviewStepForEdit(modal);
}

updateReviewStepForEdit(modal) {
    console.log('📋 Atualizando passo de revisão (edição)...');
    
    // Obter dados do formulário
    const event = modal.find('.monthly-scale-event').val().trim();
    const time = modal.find('.monthly-scale-time').val();
    const month = modal.find('#monthlyScaleMonth').val();
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    const description = modal.find('.monthly-scale-description').val().trim();
    const selections = modal.data('scaleSelections') || {};
    
    console.log('📊 Dados coletados:', {
        event,
        time,
        month,
        ministryId,
        description,
        selectionsCount: Object.keys(selections).length
    });
    
    // Obter nome do ministério
    const ministry = this.data.ministries.find(m => m.id == ministryId);
    const ministryName = ministry ? ministry.name : 'Ministério não encontrado';
    
    // Formatar mês/ano
    const formattedMonth = this.formatMonthYear(month);
    
    // Calcular estatísticas
    const dates = Object.keys(selections);
    let totalMembers = 0;
    const uniqueMembers = new Set();
    
    dates.forEach(date => {
        const dateData = selections[date] || {};
        const members = dateData.members || {};
        totalMembers += Object.keys(members).length;
        
        Object.keys(members).forEach(memberId => {
            uniqueMembers.add(memberId);
        });
    });
    
    // Atualizar elementos da revisão
    modal.find('#reviewMonth').text(formattedMonth);
    modal.find('#reviewMinistry').text(ministryName);
    modal.find('#reviewEvent').text(event || 'Não especificado');
    modal.find('#reviewTime').text(time || '19:00');
    modal.find('#reviewDatesCount').text(`${dates.length} data(s)`);
    modal.find('#reviewMembersCount').text(`${uniqueMembers.size} membro(s) únicos`);
    
    // Atualizar lista de datas
    this.updateDatesListPreview(modal, dates, selections);
}

updateDatesListPreview(modal, dates, selections) {
    const datesList = modal.find('#datesListPreview');
    
    if (dates.length === 0) {
        datesList.html(`
            <div class="alert alert-warning" style="margin-top: 15px;">
                <i class="fas fa-exclamation-triangle"></i>
                Nenhuma data selecionada
            </div>
        `);
        return;
    }
    
    let datesHtml = '<div class="review-dates-container">';
    
    dates.sort().forEach((date, index) => {
        const dateData = selections[date] || {};
        const dateObj = new Date(date);
        const formattedDate = this.formatDate(date);
        const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const memberCount = dateData.members ? Object.keys(dateData.members).length : 0;
        const specificTime = dateData.time || modal.find('.monthly-scale-time').val() || '19:00';
        
        datesHtml += `
        <div class="review-date-item">
            <div class="date-header">
                <div class="date-info">
                    <div class="date-number">${index + 1}</div>
                    <div>
                        <div class="date-main">${formattedDate}</div>
                        <div class="date-weekday">${dayOfWeek}</div>
                    </div>
                </div>
                <div class="date-stats">
                    <div class="date-time">
                        <i class="fas fa-clock"></i> ${specificTime}
                    </div>
                    <div class="date-members-count ${memberCount > 0 ? 'has-members' : ''}">
                        <i class="fas fa-users"></i> ${memberCount} membro(s)
                    </div>
                </div>
            </div>
            
            ${memberCount > 0 ? `
            <div class="date-members-list">
                <div class="members-title">Membros escalados:</div>
                <div class="members-grid">
            ` : `
            <div class="no-members">
                <i class="fas fa-user-slash"></i> Nenhum membro escalado
            </div>
            `}
            
            ${memberCount > 0 ? 
                Object.values(dateData.members).map(member => {
                    const user = this.data.users.find(u => u.id == member.id);
                    if (!user) return '';
                    
                    return `
                    <div class="member-review-item">
                        <div class="member-avatar">${this.getInitials(user.name)}</div>
                        <div class="member-info">
                            <div class="member-name">${user.name}</div>
                            <div class="member-role">${member.role || 'Participante'}</div>
                        </div>
                    </div>
                    `;
                }).join('') : ''}
            
            ${memberCount > 0 ? '</div></div>' : ''}
        </div>`;
    });
    
    datesHtml += '</div>';
    datesList.html(datesHtml);
}

async enderDatesMembersSections(modal) {
    console.log('📅 Iniciando renderização de escalas por data (CRIAÇÃO)...');
    
    const container = modal.find('#datesMembersContainer');
    const selectedDates = [];
    
    // Coletar datas selecionadas do calendário
    modal.find('.calendar-day.selected').each(function() {
        selectedDates.push($(this).data('date'));
    });
    
    console.log('📅 Datas selecionadas (criação):', selectedDates);
    
    if (selectedDates.length === 0) {
        container.html(`
            <div class="alert alert-warning">
                <i class="fas fa-calendar-times"></i>
                Nenhuma data selecionada. Volte ao passo 2 para selecionar datas.
            </div>
        `);
        return;
    }
    
    // Mostrar loading
    container.html(`
        <div style="text-align: center; padding: 40px;">
            <div class="loading-spinner large"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">
                Preparando escalas para ${dates.length} data(s)...
            </p>
        </div>
    `);
    
    // Carregar dados do ministério primeiro
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    if (!ministryId) {
        container.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Ministério não encontrado
            </div>
        `);
        return;
    }
    
    try {
        // Buscar membros do ministério
        const membersResponse = await this.apiCall(`/members/management?ministry=${ministryId}`);
        const ministryMembers = membersResponse?.success ? 
            membersResponse.data.users.filter(user => {
                if (!user.ministries) return false;
                return user.ministries.includes(parseInt(ministryId));
            }) : [];
        
        // Buscar funções do ministério
        let functionsResponse;
        try {
            functionsResponse = await this.apiCall(`/api/ministries/${ministryId}/member-functions`);
        } catch (error) {
            console.warn('⚠️ Erro ao buscar funções:', error);
            functionsResponse = { success: false };
        }
        
        const ministryFunctions = functionsResponse?.success ? 
            functionsResponse.data.functions : 
            this.data.roles.map(role => ({
                id: role,
                name: role,
                color: this.getRandomColor()
            }));
        
        // Armazenar para reutilização
        modal.data('ministryMembers', ministryMembers);
        modal.data('ministryFunctions', ministryFunctions);
        
        // Agora renderizar as seções
        this.renderSectionsWithData(modal, dates, selections, ministryMembers, ministryFunctions);
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        container.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar membros: ${error.message}
                <button class="btn btn-sm btn-outline" onclick="churchTimeApp.retryLoadMembers()" style="margin-top: 10px;">
                    Tentar novamente
                </button>
            </div>
        `);
    }
}

renderSectionsWithData(modal, dates, selections, ministryMembers, ministryFunctions) {
    const container = modal.find('#datesMembersContainer');
    const isWorshipMinistry = this.isWorshipMinistrySelected(modal);
    
    let html = '';
    
    dates.forEach((date, index) => {
        const dateData = selections[date] || {};
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const formattedDate = this.formatDate(date);
        const defaultTime = dateData.time || modal.find('.monthly-scale-time').val() || '19:00';
        const membersCount = dateData.members ? Object.keys(dateData.members).length : 0;
        
        html += `
        <div class="date-scale-section" data-date="${date}" style="margin-bottom: 30px; padding: 20px; border: 2px solid var(--success); border-radius: 12px;">
            <div class="date-scale-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-light);">
                <div style="flex: 1;">
                    <h5 style="margin: 0 0 5px 0; color: var(--success);">
                        <i class="fas fa-calendar-day"></i> 
                        ${formattedDate} 
                    </h5>
                    <small style="color: var(--text-secondary);">
                        Data ${index + 1} de ${dates.length} • ${membersCount} membro(s)
                    </small>
                </div>
                
                <div class="date-time-input" style="min-width: 120px;">
                    <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                        <i class="fas fa-clock"></i> Horário
                    </label>
                    <input type="time" 
                           class="form-input date-specific-time" 
                           value="${defaultTime}"
                           data-date="${date}"
                           style="padding: 8px 12px; font-size: 0.9rem;">
                </div>
            </div>
            
            <!-- Descrição -->
            <div class="date-description-section" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                    <i class="fas fa-align-left"></i> Descrição para esta data
                </label>
                <textarea class="form-input date-specific-description" 
                          data-date="${date}"
                          placeholder="Descreva eventos específicos para este dia..."
                          rows="2"
                          style="width: 100%; padding: 8px 12px; font-size: 0.9rem; border: 1px solid var(--border); border-radius: 6px;">${dateData.description || ''}</textarea>
            </div>
            
            ${isWorshipMinistry ? this.renderMusicSectionForEdit(date, dateData) : ''}
            
            <!-- Seção de Membros -->
            <div class="members-section">
                <div class="section-header" style="margin-bottom: 15px;">
                    <h6 style="margin: 0; color: var(--text-primary);">
                        <i class="fas fa-users"></i> Membros Escalados
                    </h6>
                    <small style="color: var(--text-secondary);">${membersCount} membro(s) nesta data</small>
                </div>
                
                <div class="date-members-container" id="membersContainer-${date.replace(/-/g, '')}">
                    ${this.renderMembersListForDate(date, dateData, ministryMembers, ministryFunctions)}
                </div>
            </div>
        </div>`;
    });
    
    container.html(html);
    
    // Configurar eventos
    this.setupDateEventsForEdit(modal);
    this.updateMembersCountForAllDates(modal);
}

updateMembersCountForAllDates(modal) {
    console.log('🔢 Atualizando contadores para todas as datas');
    
    const selections = modal.data('scaleSelections') || {};
    Object.keys(selections).forEach(date => {
        this.updateDateMembersCountForEdit(modal, date);
    });
}

// Copiar membros para próxima data em modo de edição
copyMembersToNextDateForEdit(modal, fromDate) {
    console.log('📋 Copiando membros para próxima data:', fromDate);
    
    const allDates = [];
    modal.find('.date-scale-section').each(function() {
        allDates.push($(this).data('date'));
    });
    
    allDates.sort();
    const currentIndex = allDates.indexOf(fromDate);
    
    if (currentIndex < allDates.length - 1) {
        const nextDate = allDates[currentIndex + 1];
        
        // Obter seleções da data atual
        const selections = modal.data('scaleSelections') || {};
        const fromDateData = selections[fromDate] || {};
        const fromDateMembers = fromDateData.members || {};
        
        // Copiar para próxima data
        if (!selections[nextDate]) {
            selections[nextDate] = {
                time: modal.find(`.date-specific-time[data-date="${nextDate}"]`).val() || 
                      modal.find('.monthly-scale-time').val() || 
                      '19:00',
                description: modal.find(`.date-specific-description[data-date="${nextDate}"]`).val() || '',
                members: {}
            };
        }
        
        // Copiar cada membro
        Object.entries(fromDateMembers).forEach(([userId, memberData]) => {
            // Marcar checkbox
            const nextCheckbox = modal.find(`.member-date-checkbox[data-date="${nextDate}"][data-user-id="${userId}"]`);
            const nextFunction = modal.find(`.member-date-function[data-date="${nextDate}"][data-user-id="${userId}"]`);
            
            if (nextCheckbox.length && !nextCheckbox.prop('disabled')) {
                nextCheckbox.prop('checked', true).trigger('change');
                if (memberData.function_id) {
                    nextFunction.val(memberData.function_id);
                }
            }
        });
        
        // Atualizar seleções
        selections[nextDate].members = { ...fromDateMembers };
        modal.data('scaleSelections', selections);
        
        // Atualizar contador
        this.updateDateMembersCountForEdit(modal, nextDate);
        
        this.showToast(`Escalação copiada para ${this.formatDate(nextDate)}`, 'success');
        
        // Scroll para a próxima data
        const nextSection = modal.find(`.date-scale-section[data-date="${nextDate}"]`);
        if (nextSection.length) {
            nextSection[0].scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    } else {
        this.showToast('Esta é a última data', 'info');
    }
}

renderSongsPreview(date, songs) {
    if (!songs || songs.length === 0) {
        return `
            <div class="no-songs-message" style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                Nenhuma música selecionada
            </div>
        `;
    }
    
    let html = '<div class="selected-songs-list">';
    
    songs.forEach((song, index) => {
        const songData = this.data.songs ? this.data.songs.find(s => s.id === song.id) : null;
        if (songData) {
            html += `
            <div class="selected-song-item" data-song-id="${song.id}">
                <div class="song-details">
                    <div class="song-title">${songData.title || 'Música sem título'}</div>
                    <div class="song-artist">${songData.artist || 'Artista desconhecido'}</div>
                </div>
                <div class="song-actions">
                    <span class="song-order">#${song.order || index + 1}</span>
                    <button class="btn-remove-song" data-song-id="${song.id}" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        }
    });
    
    html += '</div>';
    return html;
}

async renderDatesMembersSectionsForEdit(modal, selections) {
    console.log('📅 Renderizando escalas por data em modo de edição');
    
    const container = modal.find('#datesMembersContainer');
    const dates = Object.keys(selections).sort();
    
    if (dates.length === 0) {
        container.html(`
            <div class="alert alert-warning">
                <i class="fas fa-calendar-times"></i>
                Nenhuma data encontrada para edição.
            </div>
        `);
        return;
    }
    
    // Mostrar loading
    container.html(`
        <div style="text-align: center; padding: 40px;">
            <div class="loading-spinner large"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">
                Preparando escalas para ${dates.length} data(s)...
            </p>
        </div>
    `);
    
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    
    try {
        // Carregar dados do ministério e músicas em paralelo
        const [membersResponse, functionsResponse, songsResponse] = await Promise.all([
            this.apiCall(`/members/management?ministry=${ministryId}`),
            this.apiCall(`/api/ministries/${ministryId}/member-functions`).catch(() => ({ success: false })),
            this.apiCall('/songs') // Carregar todas as músicas
        ]);
        
        const ministryMembers = membersResponse?.success ? 
            membersResponse.data.users.filter(user => {
                if (!user.ministries) return false;
                return user.ministries.includes(parseInt(ministryId));
            }) : [];
        
        const ministryFunctions = functionsResponse?.success ? 
            functionsResponse.data.functions : 
            this.data.roles.map(role => ({
                id: role,
                name: role,
                color: this.getRandomColor()
            }));
        
        // Armazenar músicas no modal para uso posterior
        const allSongs = songsResponse?.success ? songsResponse.data.songs : this.data.songs || [];
        modal.data('allSongs', allSongs);
        
        // Armazenar outros dados
        modal.data('ministryMembers', ministryMembers);
        modal.data('ministryFunctions', ministryFunctions);
        
        // Renderizar seções
        this.renderSectionsWithDataForEdit(modal, dates, selections, ministryMembers, ministryFunctions, allSongs);
        
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
        container.html(`
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Erro ao carregar dados
                <div style="margin-top: 10px;">
                    <button class="btn btn-sm btn-outline" onclick="churchTimeApp.retryLoadMembersForEdit()">
                        Tentar novamente
                    </button>
                </div>
            </div>
        `);
    }
}
renderSectionsWithDataForEdit(modal, dates, selections, ministryMembers, ministryFunctions, allSongs) {
    const container = modal.find('#datesMembersContainer');
    const isWorshipMinistry = this.isWorshipMinistrySelected(modal);
    
    let html = '';
    
    dates.forEach((date, index) => {
        console.log('date sjo: '+date);
        const dateData = selections[date] || {};
        const formattedDate = this.formatDate(date);
        const defaultTime = dateData.time || modal.find('.monthly-scale-time').val() || '19:00';
        const membersCount = dateData.members ? Object.keys(dateData.members).length : 0;
        const songsCount = dateData.songs?.length || 0;
       
        html += `
        <div class="date-scale-section" data-date="${date}" style="margin-bottom: 30px; padding: 20px; border: 2px solid var(--success); border-radius: 12px;">
            <div class="date-scale-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-light);">
                <div style="flex: 1;">
                    <h5 style="margin: 0 0 5px 0; color: var(--success);">
                        <i class="fas fa-calendar-day"></i> 
                        ${formattedDate} 
                        <span style="font-size: 0.8rem; color: var(--text-secondary); margin-left: 10px;">
                            <i class="fas fa-lock"></i> Data travada
                        </span>
                    </h5>
                    <small style="color: var(--text-secondary);">
                        Data ${index + 1} de ${dates.length} • ${membersCount} membro(s)
                    </small>
                </div>
                
                <div class="date-time-input" style="min-width: 120px;">
                    <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                        <i class="fas fa-clock"></i> Horário
                    </label>
                    <input type="time" 
                           class="form-input date-specific-time" 
                           value="${defaultTime}"
                           data-date="${date}"
                           style="padding: 8px 12px; font-size: 0.9rem;">
                </div>
            </div>
            
            <!-- Descrição -->
            <div class="date-description-section" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                    <i class="fas fa-align-left"></i> Descrição
                </label>
                <textarea class="form-input date-specific-description" 
                          data-date="${date}"
                          placeholder="Descrição para esta data..."
                          rows="2"
                          style="width: 100%; padding: 8px 12px; font-size: 0.9rem; border: 1px solid var(--border); border-radius: 6px;">${dateData.description || ''}</textarea>
            </div>
            
            ${isWorshipMinistry ? this.renderMusicSectionForEdit(date, dateData, allSongs) : ''}
            
            <!-- Seção de Membros -->
            <div class="members-section">
                <div class="section-header" style="margin-bottom: 15px;">
                    <h6 style="margin: 0; color: var(--text-primary);">
                        <i class="fas fa-users"></i> Membros Escalados
                    </h6>
                    <small style="color: var(--text-secondary);">Selecione os membros para esta data</small>
                </div>
                
                <div class="date-members-container" id="membersContainer-${date.replace(/-/g, '')}">
                    ${this.renderMembersListForEdit(date, dateData, ministryMembers, ministryFunctions)}
                </div>
            </div>
        </div>`;
    });
    
    container.html(html);
    
    // Configurar eventos
    this.setupDateEventsForEdit(modal);
    this.setupMusicEventsForEdit(modal);
    this.updateMembersCountsForEdit(modal);
}

renderMembersListForEdit(date, dateData, ministryMembers, ministryFunctions) {
    const savedMembers = dateData.members || {};
    
    if (ministryMembers.length === 0) {
        return `
        <div class="alert alert-warning">
            <i class="fas fa-users-slash"></i>
            Nenhum membro neste ministério
        </div>`;
    }
    
    let html = `
        <div class="date-members-list" data-date="${date}">
            <div class="members-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">`;
    
    ministryMembers.forEach(user => {
        const savedMember = savedMembers[user.id] || savedMembers[user.id.toString()];
        const isChecked = !!savedMember;
        const savedFunctionId = savedMember ? (savedMember.function_id || savedMember.role) : '';
        
        html += `
            <div class="member-date-item" data-user-id="${user.id}">
                <div class="member-selection" style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" 
                           id="member-${date.replace(/-/g, '')}-${user.id}" 
                           class="member-date-checkbox" 
                           data-date="${date}"
                           data-user-id="${user.id}"
                           ${isChecked ? 'checked' : ''}>
                    <label for="member-${date.replace(/-/g, '')}-${user.id}" class="member-label" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="member-avatar-small">${this.getInitials(user.name)}</div>
                            <div>
                                <div class="member-name" style="font-weight: 500;">${user.name}</div>
                                <div class="member-skills" style="font-size: 0.85rem; color: var(--text-secondary);">
                                    ${user.skills?.join(', ') || 'Sem habilidades'}
                                </div>
                            </div>
                        </div>
                    </label>
                </div>
                
                <div class="member-function" style="margin-top: 10px;">
                    <select class="form-select member-date-function" 
                            data-date="${date}"
                            data-user-id="${user.id}"
                            ${!isChecked ? 'disabled' : ''}
                            style="width: 100%; padding: 8px 12px; font-size: 0.9rem;">
                        <option value="">Selecione a função</option>
                        ${ministryFunctions.map(func => `
                            <option value="${func.id}" 
                                    ${savedFunctionId == func.id ? 'selected' : ''}>
                                ${func.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>`;
    });
    
    html += `
            </div>
            
            <div class="date-summary" style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Resumo da data:</strong>
                        <span class="selected-count-${date.replace(/-/g, '')}">${Object.keys(savedMembers).length}</span> membro(s) escalado(s)
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}


// 1. Função para configurar eventos das datas em modo de edição
setupDateEventsForEdit(modal) {
    const self = this;
    
    // Horário
    modal.off('change', '.date-specific-time').on('change', '.date-specific-time', function() {
        const date = $(this).data('date');
        const time = $(this).val();
        self.saveDateDataForEdit(modal, date, 'time', time);
    });
    
    // Descrição
    modal.off('input', '.date-specific-description').on('input', '.date-specific-description', function() {
        const date = $(this).data('date');
        const description = $(this).val();
        self.saveDateDataForEdit(modal, date, 'description', description);
    });
    
    // Checkbox de membros
    modal.off('change', '.member-date-checkbox').on('change', '.member-date-checkbox', function() {
        const date = $(this).data('date');
        const userId = $(this).data('user-id');
        const isChecked = $(this).is(':checked');
        const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
        
        functionSelect.prop('disabled', !isChecked);
        if (!isChecked) {
            functionSelect.val('');
        }
        
        self.saveMemberSelectionForEdit(modal, date, userId, isChecked, functionSelect.val());
        self.updateDateMemberCountForEdit(modal, date);
    });
    
    // Função do membro
    modal.off('change', '.member-date-function').on('change', '.member-date-function', function() {
        const date = $(this).data('date');
        const userId = $(this).data('user-id');
        const functionId = $(this).val();
        const isChecked = modal.find(`.member-date-checkbox[data-date="${date}"][data-user-id="${userId}"]`).is(':checked');
        
        self.saveMemberSelectionForEdit(modal, date, userId, isChecked, functionId);
        self.updateDateMemberCountForEdit(modal, date);
    });
}

// 2. Salvar dados da data para edição
saveDateDataForEdit(modal, date, field, value) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {}
        };
    }
    
    selections[date][field] = value;
    modal.data('scaleSelections', selections);
}

// 3. Salvar seleção do membro para edição
saveMemberSelectionForEdit(modal, date, userId, isSelected, functionId) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {}
        };
    }
    
    if (isSelected && functionId) {
        selections[date].members[userId] = {
            id: parseInt(userId),
            function_id: functionId,
            role: modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"] option:selected`).text() || 'Participante',
            status: 'pending'
        };
    } else {
        delete selections[date].members[userId];
    }
    
    modal.data('scaleSelections', selections);
}

// 4. Atualizar contador de membros para edição
updateDateMemberCountForEdit(modal, date) {
    const dateId = date.replace(/-/g, '');
    const membersCount = modal.find(`.member-date-checkbox[data-date="${date}"]:checked`).length;
    
    modal.find(`.selected-count-${dateId}`).text(membersCount);
    modal.find(`.date-scale-section[data-date="${date}"] .date-scale-header small`)
        .html(`Data • ${membersCount} membro(s)`);
}

// 5. Atualizar todos os contadores para edição
updateMembersCountsForEdit(modal) {
    const selections = modal.data('scaleSelections') || {};
    Object.keys(selections).forEach(date => {
        this.updateDateMemberCountForEdit(modal, date);
    });
}

// 6. Função para verificar se é ministério de louvor (para mostrar seção de músicas)
isWorshipMinistrySelected(modal) {
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    if (!ministryId) return false;
    
    const ministry = this.data.ministries.find(m => m.id == ministryId);
    if (!ministry) return false;
    
    const worshipKeywords = ['louvor', 'música', 'worship', 'canto', 'banda', 'coral', 'musica'];
    const ministryName = ministry.name.toLowerCase();
    
    return worshipKeywords.some(keyword => ministryName.includes(keyword));
}

setupMusicEventsForEdit(modal) {
    const self = this;
    
    // Botão para editar músicas
    modal.off('click', '.btn-edit-songs').on('click', '.btn-edit-songs', function() {
        const date = $(this).data('date');
        self.openMusicEditModal(modal, date);
    });
    
    // Botão para editar tom de música específica
    modal.off('click', '.btn-edit-song-key').on('click', '.btn-edit-song-key', function() {
        const date = $(this).data('date');
        const songId = parseInt($(this).data('song-id'));
        self.openSongKeyEditor(modal, date, songId);
    });
    
    // Remover música diretamente da lista
    modal.on('click', '.btn-remove-song', function() {
        const date = $(this).data('date');
        const songId = parseInt($(this).data('song-id'));
        self.removeSongDirectly(modal, date, songId);
    });
    
    // Mover música na lista principal (se ainda tiver esses botões)
    modal.on('click', '.btn-move-song', function() {
        const date = $(this).data('date');
        const songId = parseInt($(this).data('song-id'));
        const direction = $(this).data('direction');
        self.moveSongInList(modal, date, songId, direction);
    });
    
    // Alterar opção de enviar letra/cifra
    modal.off('change', '.date-send-lyrics').on('change', '.date-send-lyrics', function() {
        const date = $(this).data('date');
        const sendLyrics = $(this).is(':checked');
        self.saveSendLyrics(modal, date, sendLyrics);
    });
}

// REMOVER MÚSICA DIRETAMENTE
removeSongDirectly(modal, date, songId) {
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    let selectedSongs = dateData.songs || [];
    
    // Remover música
    selectedSongs = selectedSongs.filter(s => s.id !== songId);
    
    // Reordenar
    selectedSongs.forEach((song, index) => {
        song.order = index + 1;
    });
    
    // Atualizar dados
    selections[date].songs = selectedSongs;
    modal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicListUI(modal, date);
}

// MOVER MÚSICA NA LISTA
moveSongInList(modal, date, songId, direction) {
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    const index = selectedSongs.findIndex(s => s.id === songId);
    
    if (direction === 'up' && index > 0) {
        [selectedSongs[index], selectedSongs[index - 1]] = [selectedSongs[index - 1], selectedSongs[index]];
    } else if (direction === 'down' && index < selectedSongs.length - 1) {
        [selectedSongs[index], selectedSongs[index + 1]] = [selectedSongs[index + 1], selectedSongs[index]];
    }
    
    // Atualizar ordens
    selectedSongs.forEach((song, idx) => {
        song.order = idx + 1;
    });
    
    // Atualizar dados
    selections[date].songs = selectedSongs;
    modal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicListUI(modal, date);
}

// ATUALIZAR UI DA LISTA DE MÚSICAS
updateMusicListUI(modal, date) {
    const selections = modal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    const allSongs = modal.data('allSongs') || [];
    const songsListContainer = modal.find(`#selectedSongs-${date.replace(/-/g, '')}`);
    
    if (selectedSongs.length === 0) {
        songsListContainer.html(`
            <div style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                Nenhuma música selecionada
            </div>
        `);
    } else {
        let songsHtml = '<div class="selected-songs-list">';
        selectedSongs.forEach((song, index) => {
            const songInfo = allSongs.find(s => s.id === song.id) || {};
            songsHtml += `
            <div class="selected-song-item" data-song-id="${song.id}" 
                 style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; background: var(--card-bg); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--primary); font-weight: bold;">${index + 1}.</span>
                    <div>
                        <div style="font-weight: 500;">${songInfo.title || 'Música'}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${songInfo.artist || ''}</div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline btn-move-song" data-date="${date}" data-song-id="${song.id}" data-direction="up" 
                            ${index === 0 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-move-song" data-date="${date}" data-song-id="${song.id}" data-direction="down" 
                            ${index === selectedSongs.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-remove-song" data-date="${date}" data-song-id="${song.id}" style="padding: 2px 6px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        });
        songsHtml += '</div>';
        songsListContainer.html(songsHtml);
    }
    
    // Atualizar contador
    const songsCount = selectedSongs.length;
    modal.find(`.date-music-section[data-date="${date}"] .section-header small`)
        .text(`${songsCount} música(s) selecionada(s)`);
}

// SALVAR TOM MUSICAL
saveMusicKey(modal, date, key) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = { music_key: key };
    } else {
        selections[date].music_key = key;
    }
    
    modal.data('scaleSelections', selections);
}

// SALVAR OPÇÃO DE ENVIAR LETRA/CIFRA
saveSendLyrics(modal, date, sendLyrics) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = { send_lyrics: sendLyrics };
    } else {
        selections[date].send_lyrics = sendLyrics;
    }
    
    modal.data('scaleSelections', selections);
}

// 2. Função para renderizar seções com dados
renderSectionsWithData(modal, dates, selections, ministryMembers, ministryFunctions) {
    const container = modal.find('#datesMembersContainer');
    const isWorshipMinistry = this.isWorshipMinistrySelected(modal);
    
    let html = '';
    
    dates.forEach((date, index) => {
        const dateData = selections[date] || {};
        const [year, month, day] = date.split('-').map(Number);
        const formattedDate = this.formatDate(date);
        const defaultTime = dateData.time || modal.find('.monthly-scale-time').val() || '19:00';
        const membersCount = dateData.members ? Object.keys(dateData.members).length : 0;
        
        html += `
        <div class="date-scale-section" data-date="${date}" style="margin-bottom: 30px; padding: 20px; border: 2px solid var(--success); border-radius: 12px;">
            <div class="date-scale-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid var(--primary-light);">
                <div style="flex: 1;">
                    <h5 style="margin: 0 0 5px 0; color: var(--success);">
                        <i class="fas fa-calendar-day"></i> 
                        ${formattedDate} 
                    </h5>
                    <small style="color: var(--text-secondary);">
                        Data ${index + 1} de ${dates.length} • ${membersCount} membro(s)
                    </small>
                </div>
                
                <div class="date-time-input" style="min-width: 120px;">
                    <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                        <i class="fas fa-clock"></i> Horário
                    </label>
                    <input type="time" 
                           class="form-input date-specific-time" 
                           value="${defaultTime}"
                           data-date="${date}"
                           style="padding: 8px 12px; font-size: 0.9rem;">
                </div>
            </div>
            
            <!-- Descrição -->
            <div class="date-description-section" style="margin-bottom: 20px;">
                <label style="display: block; font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 5px;">
                    <i class="fas fa-align-left"></i> Descrição
                </label>
                <textarea class="form-input date-specific-description" 
                          data-date="${date}"
                          placeholder="Descrição para esta data..."
                          rows="2"
                          style="width: 100%; padding: 8px 12px; font-size: 0.9rem; border: 1px solid var(--border); border-radius: 6px;">${dateData.description || ''}</textarea>
            </div>
            
            ${isWorshipMinistry ? this.renderMusicSection(date, dateData) : ''}
            
            <!-- Seção de Membros -->
            <div class="members-section">
                <div class="section-header" style="margin-bottom: 15px;">
                    <h6 style="margin: 0; color: var(--text-primary);">
                        <i class="fas fa-users"></i> Membros Escalados
                    </h6>
                    <small style="color: var(--text-secondary);">Selecione os membros para esta data</small>
                </div>
                
                <div class="date-members-container" id="membersContainer-${date.replace(/-/g, '')}">
                    ${this.renderMembersList(date, dateData, ministryMembers, ministryFunctions)}
                </div>
            </div>
        </div>`;
    });
    
    container.html(html);
    
    // Configurar eventos
    this.setupDateEvents(modal);
    this.updateMembersCounts(modal);
}

// 3. Função para renderizar lista de membros
renderMembersList(date, dateData, ministryMembers, ministryFunctions) {
    const savedMembers = dateData.members || {};
    
    if (ministryMembers.length === 0) {
        return `
        <div class="alert alert-warning">
            <i class="fas fa-users-slash"></i>
            Nenhum membro neste ministério
        </div>`;
    }
    
    let html = `
        <div class="date-members-list" data-date="${date}">
            <div class="members-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">`;
    
    ministryMembers.forEach(user => {
        const savedMember = savedMembers[user.id] || savedMembers[user.id.toString()];
        const isChecked = !!savedMember;
        const savedFunctionId = savedMember ? (savedMember.function_id || savedMember.role) : '';
        
        html += `
            <div class="member-date-item" data-user-id="${user.id}">
                <div class="member-selection" style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" 
                           id="member-${date.replace(/-/g, '')}-${user.id}" 
                           class="member-date-checkbox" 
                           data-date="${date}"
                           data-user-id="${user.id}"
                           ${isChecked ? 'checked' : ''}>
                    <label for="member-${date.replace(/-/g, '')}-${user.id}" class="member-label" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="member-avatar-small">${this.getInitials(user.name)}</div>
                            <div>
                                <div class="member-name" style="font-weight: 500;">${user.name}</div>
                                <div class="member-skills" style="font-size: 0.85rem; color: var(--text-secondary);">
                                    ${user.skills?.join(', ') || 'Sem habilidades'}
                                </div>
                            </div>
                        </div>
                    </label>
                </div>
                
                <div class="member-function" style="margin-top: 10px;">
                    <select class="form-select member-date-function" 
                            data-date="${date}"
                            data-user-id="${user.id}"
                            ${!isChecked ? 'disabled' : ''}
                            style="width: 100%; padding: 8px 12px; font-size: 0.9rem;">
                        <option value="">Selecione a função</option>
                        ${ministryFunctions.map(func => `
                            <option value="${func.id}" 
                                    ${savedFunctionId == func.id ? 'selected' : ''}>
                                ${func.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>`;
    });
    
    html += `
            </div>
            
            <div class="date-summary" style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Resumo da data:</strong>
                        <span class="selected-count-${date.replace(/-/g, '')}">${Object.keys(savedMembers).length}</span> membro(s) escalado(s)
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// 4. Função para renderizar seção de músicas
renderMusicSection(date, dateData) {
    const songsCount = dateData.songs?.length || 0;
    
    return `
    <div class="date-music-section" style="margin-bottom: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
        <div class="section-header" style="margin-bottom: 10px;">
            <label style="font-size: 0.85rem; color: var(--text-secondary);">
                <i class="fas fa-music"></i> Repertório
            </label>
        </div>
        
        <div class="selected-songs-container" id="selectedSongs-${date.replace(/-/g, '')}" style="margin-top: 10px;">
            ${songsCount > 0 ? 
                `<div style="color: var(--text-secondary); font-size: 0.9rem;">
                    ${songsCount} música(s) selecionada(s)
                </div>` : 
                `<div style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                    Nenhuma música selecionada
                </div>`
            }
        </div>
    </div>`;
}

// 5. Configurar eventos das datas
setupDateEvents(modal) {
    const self = this;
    
    // Horário
    modal.off('change', '.date-specific-time').on('change', '.date-specific-time', function() {
        const date = $(this).data('date');
        const time = $(this).val();
        self.saveDateData(modal, date, 'time', time);
    });
    
    // Descrição
    modal.off('input', '.date-specific-description').on('input', '.date-specific-description', function() {
        const date = $(this).data('date');
        const description = $(this).val();
        self.saveDateData(modal, date, 'description', description);
    });
    
    // Checkbox de membros
    modal.off('change', '.member-date-checkbox').on('change', '.member-date-checkbox', function() {
        const date = $(this).data('date');
        const userId = $(this).data('user-id');
        const isChecked = $(this).is(':checked');
        const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
        
        functionSelect.prop('disabled', !isChecked);
        if (!isChecked) {
            functionSelect.val('');
        }
        
        self.saveMemberSelection(modal, date, userId, isChecked, functionSelect.val());
        self.updateDateMemberCount(modal, date);
    });
    
    // Função do membro
    modal.off('change', '.member-date-function').on('change', '.member-date-function', function() {
        const date = $(this).data('date');
        const userId = $(this).data('user-id');
        const functionId = $(this).val();
        const isChecked = modal.find(`.member-date-checkbox[data-date="${date}"][data-user-id="${userId}"]`).is(':checked');
        
        self.saveMemberSelection(modal, date, userId, isChecked, functionId);
        self.updateDateMemberCount(modal, date);
    });
}

// 6. Salvar dados da data
saveDateData(modal, date, field, value) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {}
        };
    }
    
    selections[date][field] = value;
    modal.data('scaleSelections', selections);
}

// 7. Salvar seleção do membro
saveMemberSelection(modal, date, userId, isSelected, functionId) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {}
        };
    }
    
    if (isSelected && functionId) {
        selections[date].members[userId] = {
            id: parseInt(userId),
            function_id: functionId,
            role: modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"] option:selected`).text() || 'Participante',
            status: 'pending'
        };
    } else {
        delete selections[date].members[userId];
    }
    
    modal.data('scaleSelections', selections);
}

// 8. Atualizar contador de membros
updateDateMemberCount(modal, date) {
    const dateId = date.replace(/-/g, '');
    const membersCount = modal.find(`.member-date-checkbox[data-date="${date}"]:checked`).length;
    
    modal.find(`.selected-count-${dateId}`).text(membersCount);
    modal.find(`.date-scale-section[data-date="${date}"] .date-scale-header small`)
        .html(`Data • ${membersCount} membro(s)`);
}

// 9. Atualizar todos os contadores
updateMembersCounts(modal) {
    const selections = modal.data('scaleSelections') || {};
    Object.keys(selections).forEach(date => {
        this.updateDateMemberCount(modal, date);
    });
}

// 10. Método para tentar novamente
retryLoadMembersForEdit() {
    console.log('🔄 Tentando carregar membros novamente');
    const modal = $('.modal').first();
    if (modal.length) {
        const selections = modal.data('scaleSelections') || {};
        this.renderDatesMembersSectionsForEdit(modal, selections);
    }
}

// Tentar novamente carregar membros
retryLoadMembers() {
    console.log('🔄 Tentando carregar membros novamente');
    // Esta função pode ser chamada quando houver erro
    const modal = $('.modal').first();
    if (modal.length) {
        const groupData = modal.data('editGroupData');
        if (groupData) {
            this.renderDatesMembersSectionsForEdit(modal, groupData.selections || {});
        }
    }
}

// Renderizar seção de músicas para edição
renderMusicSectionForEdit(date, dateData, allSongs) {
    const songsCount = dateData.songs?.length || 0;
    const selectedSongs = dateData.songs || [];
    
    // Ordenar por ordem
    const sortedSongs = [...selectedSongs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    // Renderizar lista de músicas selecionadas
    let songsListHtml = '';
    if (songsCount > 0) {
        songsListHtml = '<div class="selected-songs-list" style="margin-top: 10px;">';
        sortedSongs.forEach((song, index) => {
            const songInfo = allSongs.find(s => s.id === song.id) || {};
            const keyBadge = song.key ? 
                `<span class="song-key-badge" style="margin-left: 8px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 0.8rem;">
                    ${song.key}
                </span>` : '';
            
            songsListHtml += `
            <div class="selected-song-item" data-song-id="${song.id}" style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background: var(--card-bg); border-radius: 6px; margin-bottom: 5px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--text-secondary); font-size: 0.9rem;">${index + 1}.</span>
                    <div>
                        <div style="font-weight: 500;">${songInfo.title || 'Música não encontrada'}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">
                            ${songInfo.artist || ''} ${keyBadge}
                        </div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline btn-edit-song-key" data-date="${date}" data-song-id="${song.id}" style="padding: 2px 6px; margin-right: 5px;" title="Editar tom">
                        <i class="fas fa-guitar"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-remove-song" data-date="${date}" data-song-id="${song.id}" style="padding: 2px 6px;" title="Remover">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        });
        songsListHtml += '</div>';
    } else {
        songsListHtml = `
        <div style="text-align: center; padding: 15px; color: var(--text-tertiary);">
            <i class="fas fa-music" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
            <p>Nenhuma música selecionada</p>
        </div>`;
    }
    
    return `
    <div class="date-music-section" style="margin-bottom: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
        <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
            <div>
                <label style="font-size: 0.9rem; color: var(--text-secondary); font-weight: 500;">
                    <i class="fas fa-music"></i> Repertório
                </label>
                <small style="display: block; color: var(--text-tertiary); font-size: 0.8rem;">
                    ${songsCount} música(s) selecionada(s)
                </small>
            </div>
            <button type="button" class="btn btn-sm btn-primary btn-edit-songs" data-date="${date}">
                <i class="fas fa-edit"></i> Editar Músicas
            </button>
        </div>
        
        <!-- Lista de músicas selecionadas -->
        <div class="selected-songs-container" id="selectedSongs-${date.replace(/-/g, '')}" 
             data-date="${date}" style="margin-top: 10px;">
            ${songsListHtml}
        </div>
        
        <!-- Opção de enviar letra e cifra -->
        <div class="music-notification-section" style="margin-top: 15px; padding: 10px; background: var(--card-bg); border-radius: 6px;">
            <label style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-secondary); cursor: pointer;">
                <input type="checkbox" class="date-send-lyrics" data-date="${date}" 
                       ${dateData.send_lyrics !== false ? 'checked' : ''} disabled>
                <i class="fas fa-paper-plane"></i>
                Enviar letra e cifra aos membros escalados
            </label>
            <small style="display: block; margin-top: 5px; color: var(--text-tertiary); font-size: 0.75rem;">
                Os membros receberão notificação com letra e cifra das músicas selecionadas
            </small>
        </div>
    </div>`;
}
openMusicEditModal(modal, date) {
    const dateData = modal.data('scaleSelections')[date] || {};
    const selectedSongs = dateData.songs || [];
    const allSongs = modal.data('allSongs') || this.data.songs || [];
    
    // Criar modal de edição de músicas
    const musicModal = $(`
    <div class="modal" id="musicEditModal-${date.replace(/-/g, '')}">
        <div class="modal-content" style="max-width: 800px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-music"></i> Editar Músicas - ${this.formatDate(date)}
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-section" style="margin-bottom: 20px;">
                    <input type="text" class="form-input music-search" 
                           placeholder="Buscar músicas por título ou artista..."
                           style="width: 100%;">
                </div>
                
                <div class="songs-list-section" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                    <!-- Todas as músicas -->
                    <div class="available-songs">
                        <h4 style="margin-bottom: 15px; color: var(--text-primary);">
                            <i class="fas fa-list"></i> Todas as Músicas
                            <small style="color: var(--text-secondary); font-size: 0.9rem;">
                                (${allSongs.length} disponíveis)
                            </small>
                        </h4>
                        <div class="songs-container" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: 10px;">
                            ${this.renderAvailableSongsListForEdit(allSongs, selectedSongs)}
                        </div>
                    </div>
                    
                    <!-- Músicas selecionadas -->
                    <div class="selected-songs">
                        <h4 style="margin-bottom: 15px; color: var(--text-primary);">
                            <i class="fas fa-check-circle"></i> Selecionadas
                            <small style="color: var(--text-secondary); font-size: 0.9rem;">
                                (${selectedSongs.length} selecionadas)
                            </small>
                        </h4>
                        <div class="selected-container" id="selectedMusicContainer-${date.replace(/-/g, '')}" 
                             style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); border-radius: 6px; padding: 10px;">
                            ${this.renderSelectedSongsListForEdit(selectedSongs, allSongs)}
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 10px;">
                    <button class="btn btn-secondary btn-cancel-music-edit">
                        Cancelar
                    </button>
                    <button class="btn btn-primary btn-save-music-edit" data-date="${date}">
                        <i class="fas fa-save"></i> Salvar
                    </button>
                </div>
            </div>
        </div>
    </div>`);
    
    musicModal.appendTo('body');
    
    // Configurar eventos do modal de músicas
    this.setupMusicEditModalEvents(musicModal, modal, date, allSongs);
}

renderSelectedSongsListForEdit(selectedSongs, allSongs) {
    if (!selectedSongs || selectedSongs.length === 0) {
        return `<div style="text-align: center; padding: 20px; color: var(--text-tertiary);">Nenhuma música selecionada</div>`;
    }
    
    // Ordenar por ordem
    const sortedSongs = [...selectedSongs].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    let html = '<div class="selected-songs-list">';
    
    sortedSongs.forEach((selectedSong, index) => {
        const song = allSongs.find(s => s.id === selectedSong.id);
        if (!song) return;
        
        const keyBadge = selectedSong.key ? 
            `<span class="song-key-badge" style="margin-left: 8px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 0.8rem;">
                ${selectedSong.key}
            </span>` : '';
        
        html += `
        <div class="selected-song-item" data-song-id="${song.id}" data-order="${selectedSong.order}"
             style="padding: 10px; margin-bottom: 5px; border-radius: 6px; background: var(--card-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--primary); font-weight: bold; min-width: 20px;">${selectedSong.order}.</span>
                    <div>
                        <div style="font-weight: 500;">${song.title}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">
                            ${song.artist} ${keyBadge}
                        </div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline btn-edit-song-key" data-song-id="${song.id}" 
                            style="padding: 2px 6px; margin-right: 5px;" title="Editar tom">
                        <i class="fas fa-guitar"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-move-song-up" data-song-id="${song.id}" 
                            ${index === 0 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-move-song-down" data-song-id="${song.id}" 
                            ${index === selectedSongs.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-remove-selected-song" data-song-id="${song.id}" 
                            style="padding: 2px 6px; color: var(--danger);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

renderAvailableSongsListForEdit(allSongs, selectedSongs) {
    const selectedIds = selectedSongs.map(s => s.id);
    
    if (!allSongs || allSongs.length === 0) {
        return `<div style="text-align: center; padding: 20px; color: var(--text-tertiary);">Nenhuma música cadastrada</div>`;
    }
    
    let html = '<div class="available-songs-list">';
    
    allSongs.forEach(song => {
        const isSelected = selectedIds.includes(song.id);
        const selectedSong = selectedSongs.find(s => s.id === song.id);
        
        html += `
        <div class="song-item ${isSelected ? 'selected' : ''}" data-song-id="${song.id}" 
             style="padding: 10px; margin-bottom: 5px; border-radius: 6px; cursor: pointer; 
                    background: ${isSelected ? 'var(--secondary)' : 'transparent'};
                    border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};">
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="song-checkbox" data-song-id="${song.id}" 
                       ${isSelected ? 'checked disabled' : ''}>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${song.title || 'Sem título'}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">${song.artist || 'Artista desconhecido'}</div>
                    ${song.duration ? `<div style="font-size: 0.8rem; color: var(--text-tertiary);"><i class="fas fa-clock"></i> ${song.duration}</div>` : ''}
                </div>
                ${!isSelected ? `
                <button class="btn btn-sm btn-outline btn-add-song" data-song-id="${song.id}" 
                        style="padding: 2px 8px; font-size: 0.8rem;">
                    <i class="fas fa-plus"></i>
                </button>
                ` : ''}
            </div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}



setupMusicEditModalEvents(musicModal, mainModal, date, allSongs) {
    const self = this;
    
    // Fechar modal
    musicModal.find('.modal-close, .btn-cancel-music-edit').click(() => {
        musicModal.remove();
    });
    
    // Busca de músicas
    musicModal.find('.music-search').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        musicModal.find('.song-item').each(function() {
            const title = $(this).find('div:first-child').text().toLowerCase();
            const artist = $(this).find('div:nth-child(2)').text().toLowerCase();
            
            if (title.includes(searchTerm) || artist.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });
    
    // Adicionar música
    musicModal.on('click', '.btn-add-song', function(e) {
        e.stopPropagation();
        const songId = parseInt($(this).data('song-id'));
        self.addSongToSelectionForEdit(musicModal, mainModal, date, songId, allSongs);
    });
    
    // Clicar na linha da música não selecionada
    musicModal.on('click', '.song-item:not(.selected)', function(e) {
        if (!$(e.target).is('input') && !$(e.target).is('button')) {
            const songId = parseInt($(this).data('song-id'));
            self.addSongToSelectionForEdit(musicModal, mainModal, date, songId, allSongs);
        }
    });
    
    // Remover música selecionada
    musicModal.on('click', '.btn-remove-selected-song', function(e) {
        e.stopPropagation();
        const songId = parseInt($(this).data('song-id'));
        self.removeSongFromSelectionForEdit(musicModal, mainModal, date, songId, allSongs);
    });
    
    // Mover música para cima
    musicModal.on('click', '.btn-move-song-up', function(e) {
        e.stopPropagation();
        const songId = parseInt($(this).data('song-id'));
        self.moveSongUpForEdit(musicModal, mainModal, date, songId, allSongs);
    });
    
    // Mover música para baixo
    musicModal.on('click', '.btn-move-song-down', function(e) {
        e.stopPropagation();
        const songId = parseInt($(this).data('song-id'));
        self.moveSongDownForEdit(musicModal, mainModal, date, songId, allSongs);
    });
    
    // Editar tom da música
    musicModal.on('click', '.btn-edit-song-key', function(e) {
        e.stopPropagation();
        const songId = parseInt($(this).data('song-id'));
        self.openSongKeyEditorForEdit(musicModal, mainModal, date, songId, allSongs);
    });
    
    // Salvar seleção
    musicModal.find('.btn-save-music-edit').click(() => {
        self.saveMusicSelectionForEdit(musicModal, mainModal, date, allSongs);
    });
}

saveMusicSelectionForEdit(musicModal, mainModal, date, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    // Atualizar a lista de músicas no modal principal
    const songsListContainer = mainModal.find(`#selectedSongs-${date.replace(/-/g, '')}`);
    
    if (selectedSongs.length === 0) {
        songsListContainer.html(`
            <div style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                Nenhuma música selecionada
            </div>
        `);
    } else {
        let songsHtml = '<div class="selected-songs-list">';
        
        // Ordenar por ordem
        const sortedSongs = [...selectedSongs].sort((a, b) => (a.order || 0) - (b.order || 0));
        
        sortedSongs.forEach((song, index) => {
            const songInfo = allSongs.find(s => s.id === song.id) || {};
            const keyBadge = song.key ? 
                `<span class="song-key-badge" style="margin-left: 8px; padding: 2px 6px; background: var(--primary-light); color: var(--primary); border-radius: 4px; font-size: 0.8rem;">
                    ${song.key}
                </span>` : '';
            
            songsHtml += `
            <div class="selected-song-item" data-song-id="${song.id}" 
                 style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; background: var(--card-bg); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--primary); font-weight: bold;">${song.order || index + 1}.</span>
                    <div>
                        <div style="font-weight: 500;">${songInfo.title || 'Música'}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">
                            ${songInfo.artist || ''} ${keyBadge}
                        </div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline btn-edit-song-key" data-date="${date}" data-song-id="${song.id}" 
                            style="padding: 2px 6px; margin-right: 5px;" title="Editar tom">
                        <i class="fas fa-guitar"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-remove-song" data-date="${date}" data-song-id="${song.id}" 
                            style="padding: 2px 6px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>`;
        });
        
        songsHtml += '</div>';
        songsListContainer.html(songsHtml);
    }
    
    // Fechar modal de músicas
    musicModal.remove();
    
    // Atualizar eventos dos botões no modal principal
    this.setupMusicEventsForEdit(mainModal);
}

openSongKeyEditorForEdit(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const song = dateData.songs?.find(s => s.id === songId);
    const songData = allSongs.find(s => s.id === songId);
    
    if (!song || !songData) return;
    
    // Criar modal para editar tom
    const keyModal = $(`
    <div class="modal song-key-modal-edit">
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h3 class="modal-title">
                    <i class="fas fa-guitar"></i> Tom para "${songData.title}"
                </h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Selecione o tom:</label>
                    <select class="form-input song-key-select-edit" 
                            style="width: 100%; padding: 10px 12px; font-size: 1rem;">
                        <option value="">Sem tom definido</option>
                        <option value="C" ${song.key === 'C' ? 'selected' : ''}>C (Dó)</option>
                        <option value="C#" ${song.key === 'C#' ? 'selected' : ''}>C# (Dó sustenido)</option>
                        <!-- ... outras opções ... -->
                    </select>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-secondary btn-cancel-key-edit">Cancelar</button>
                <button class="btn btn-primary btn-save-key-edit" 
                        data-date="${date}" 
                        data-song-id="${songId}">
                    <i class="fas fa-save"></i> Salvar
                </button>
            </div>
        </div>
    </div>`);
    
    keyModal.appendTo('body');
    
    // Configurar eventos
    const self = this;
    
    keyModal.find('.modal-close, .btn-cancel-key-edit').click(() => {
        keyModal.remove();
    });
    
    keyModal.find('.btn-save-key-edit').click(() => {
        const newKey = keyModal.find('.song-key-select-edit').val();
        
        console.log('💾 Salvando tom no modal de edição:', { date, songId, newKey });
        
        // CORREÇÃO: Passar todos os parâmetros corretamente
        const success = self.updateSongKeyForEdit(musicModal, mainModal, date, songId, newKey, allSongs);
        
        if (success) {
            self.showToast('Tom atualizado com sucesso!', 'success');
        } else {
            self.showToast('Erro ao atualizar tom', 'error');
        }
        
        keyModal.remove();
    });
}

updateSongKeyForEdit(musicModal, mainModal, date, songId, key, allSongs) {
    console.log('🎸 updateSongKeyForEdit:', { date, songId, key });
    
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    
    if (dateData.songs) {
        const songIndex = dateData.songs.findIndex(s => s.id === songId);
        if (songIndex !== -1) {
            dateData.songs[songIndex].key = key;
            // CORREÇÃO: usar mainModal, não modal
            mainModal.data('scaleSelections', selections);
            
            console.log('✅ Tom atualizado:', dateData.songs[songIndex]);
            
            // Atualizar UI
            this.updateMusicEditModalUIForEdit(musicModal, mainModal, date, allSongs);
            
            // Atualizar também a lista principal de músicas
            this.updateDateSongsPreview(mainModal, date, dateData.songs);
            
            return true;
        }
    }
    
    console.error('❌ Música não encontrada para atualizar tom:', songId);
    return false;
}


removeSongFromSelectionForEdit(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    let selectedSongs = dateData.songs || [];
    
    // Remover música
    selectedSongs = selectedSongs.filter(s => s.id !== songId);
    
    // Reordenar
    selectedSongs.forEach((song, index) => {
        song.order = index + 1;
    });
    
    // Atualizar dados
    selections[date].songs = selectedSongs;
    mainModal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicEditModalUIForEdit(musicModal, mainModal, date, allSongs);
}

updateMusicEditModalUIForEdit(musicModal, mainModal, date, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    console.log('🔄 Atualizando UI do modal de edição:', selectedSongs.length);
    
    // Atualizar lista de músicas disponíveis
    musicModal.find('.available-songs .songs-container').html(
        this.renderAvailableSongsList(allSongs, selectedSongs)
    );
    
    // Atualizar lista de músicas selecionadas
    musicModal.find(`#selectedMusicContainer-${date.replace(/-/g, '')}`).html(
        this.renderSelectedSongsList(selectedSongs, allSongs)
    );
    
    // Atualizar contador
    musicModal.find('.selected-songs small').text(`(${selectedSongs.length} selecionadas)`);
}

addSongToSelectionForEdit(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    let selectedSongs = dateData.songs || [];
    
    // Verificar se já está selecionada
    if (selectedSongs.some(s => s.id === songId)) {
        return;
    }
    
    // Adicionar com ordem sequencial
    selectedSongs.push({
        id: songId,
        order: selectedSongs.length + 1,
        key: '' // Tom inicial vazio
    });
    
    // Atualizar dados
    if (!selections[date]) {
        selections[date] = { songs: selectedSongs };
    } else {
        selections[date].songs = selectedSongs;
    }
    
    mainModal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicEditModalUIForEdit(musicModal, mainModal, date, allSongs);
}


addSongToSelection(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    // Verificar se já está selecionada
    if (selectedSongs.some(s => s.id === songId)) {
        return;
    }
    
    // Adicionar com ordem sequencial
    selectedSongs.push({
        id: songId,
        order: selectedSongs.length + 1
    });
    
    // Atualizar dados
    if (!selections[date]) {
        selections[date] = { songs: selectedSongs };
    } else {
        selections[date].songs = selectedSongs;
    }
    
    mainModal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicEditModalUI(musicModal, mainModal, date, allSongs);
}

// REMOVER MÚSICA DA SELEÇÃO
removeSongFromSelection(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    let selectedSongs = dateData.songs || [];
    
    // Remover música
    selectedSongs = selectedSongs.filter(s => s.id !== songId);
    
    // Reordenar
    selectedSongs.forEach((song, index) => {
        song.order = index + 1;
    });
    
    // Atualizar dados
    selections[date].songs = selectedSongs;
    mainModal.data('scaleSelections', selections);
    
    // Atualizar UI
    this.updateMusicEditModalUI(musicModal, mainModal, date, allSongs);
}

// MOVER MÚSICA PARA CIMA
moveSongUp(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    const index = selectedSongs.findIndex(s => s.id === songId);
    if (index > 0) {
        // Trocar posições
        [selectedSongs[index], selectedSongs[index - 1]] = [selectedSongs[index - 1], selectedSongs[index]];
        
        // Atualizar ordens
        selectedSongs.forEach((song, idx) => {
            song.order = idx + 1;
        });
        
        // Atualizar dados
        selections[date].songs = selectedSongs;
        mainModal.data('scaleSelections', selections);
        
        // Atualizar UI
        this.updateMusicEditModalUI(musicModal, mainModal, date, allSongs);
    }
}

// MOVER MÚSICA PARA BAIIXO
moveSongDown(musicModal, mainModal, date, songId, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    const index = selectedSongs.findIndex(s => s.id === songId);
    if (index < selectedSongs.length - 1) {
        // Trocar posições
        [selectedSongs[index], selectedSongs[index + 1]] = [selectedSongs[index + 1], selectedSongs[index]];
        
        // Atualizar ordens
        selectedSongs.forEach((song, idx) => {
            song.order = idx + 1;
        });
        
        // Atualizar dados
        selections[date].songs = selectedSongs;
        mainModal.data('scaleSelections', selections);
        
        // Atualizar UI
        this.updateMusicEditModalUI(musicModal, mainModal, date, allSongs);
    }
}

// ATUALIZAR UI DO MODAL DE MÚSICAS
updateMusicEditModalUI(musicModal, mainModal, date, allSongs) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    // Atualizar lista de músicas disponíveis
    musicModal.find('.available-songs .songs-container').html(
        this.renderAvailableSongsList(allSongs, selectedSongs)
    );
    
    // Atualizar lista de músicas selecionadas
    musicModal.find(`#selectedMusicContainer-${date.replace(/-/g, '')}`).html(
        this.renderSelectedSongsList(selectedSongs, allSongs)
    );
    
    // Atualizar contador
    musicModal.find('.selected-songs small').text(`(${selectedSongs.length} selecionadas)`);
}

// SALVAR SELEÇÃO DE MÚSICAS
saveMusicSelection(musicModal, mainModal, date) {
    const selections = mainModal.data('scaleSelections') || {};
    const dateData = selections[date] || {};
    const selectedSongs = dateData.songs || [];
    
    // Atualizar a lista de músicas no modal principal
    const songsListContainer = mainModal.find(`#selectedSongs-${date.replace(/-/g, '')}`);
    const allSongs = mainModal.data('allSongs') || [];
    
    if (selectedSongs.length === 0) {
        songsListContainer.html(`
            <div style="text-align: center; padding: 10px; color: var(--text-tertiary); font-size: 0.8rem;">
                Nenhuma música selecionada
            </div>
        `);
    } else {
        let songsHtml = '<div class="selected-songs-list">';
        selectedSongs.forEach((song, index) => {
            const songInfo = allSongs.find(s => s.id === song.id) || {};
            songsHtml += `
            <div class="selected-song-item" data-song-id="${song.id}" 
                 style="display: flex; justify-content: space-between; align-items: center; padding: 8px; margin-bottom: 5px; background: var(--card-bg); border-radius: 6px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--primary); font-weight: bold;">${index + 1}.</span>
                    <div>
                        <div style="font-weight: 500;">${songInfo.title || 'Música'}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${songInfo.artist || ''}</div>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline btn-remove-song" data-date="${date}" data-song-id="${song.id}" style="padding: 2px 6px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>`;
        });
        songsHtml += '</div>';
        songsListContainer.html(songsHtml);
    }
    
    // Fechar modal de músicas
    musicModal.remove();
}

renderSelectedSongsList(selectedSongs, allSongs) {
    if (!selectedSongs || selectedSongs.length === 0) {
        return `<div style="text-align: center; padding: 20px; color: var(--text-tertiary);">Nenhuma música selecionada</div>`;
    }
    
    let html = '<div class="selected-songs-list">';
    
    selectedSongs.forEach((selectedSong, index) => {
        const song = allSongs.find(s => s.id === selectedSong.id);
        if (!song) return;
        
        html += `
        <div class="selected-song-item" data-song-id="${song.id}" data-order="${index + 1}"
             style="padding: 10px; margin-bottom: 5px; border-radius: 6px; background: var(--card-bg);">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="color: var(--primary); font-weight: bold; min-width: 20px;">${index + 1}.</span>
                    <div>
                        <div style="font-weight: 500;">${song.title}</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${song.artist}</div>
                    </div>
                </div>
                <div>
                    <button class="btn btn-sm btn-outline btn-move-song-up" data-song-id="${song.id}" 
                            ${index === 0 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-move-song-down" data-song-id="${song.id}" 
                            ${index === selectedSongs.length - 1 ? 'disabled' : ''} style="padding: 2px 6px; margin-right: 5px;">
                        <i class="fas fa-arrow-down"></i>
                    </button>
                    <button class="btn btn-sm btn-outline btn-remove-selected-song" data-song-id="${song.id}" 
                            style="padding: 2px 6px; color: var(--danger);">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}

renderAvailableSongsList(allSongs, selectedSongs) {
    if (!allSongs || allSongs.length === 0) {
        return `<div style="text-align: center; padding: 20px; color: var(--text-tertiary);">Nenhuma música cadastrada</div>`;
    }
    
    const selectedIds = selectedSongs.map(s => s.id);
    
    let html = '<div class="available-songs-list">';
    
    allSongs.forEach(song => {
        const isSelected = selectedIds.includes(song.id);
        
        html += `
        <div class="song-item ${isSelected ? 'selected' : ''}" data-song-id="${song.id}" 
             style="padding: 10px; margin-bottom: 5px; border-radius: 6px; cursor: pointer; 
                    background: ${isSelected ? 'var(--secondary)' : 'transparent'};
                    border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border)'};">
            <div style="display: flex; align-items: center; gap: 10px;">
                <input type="checkbox" class="song-checkbox" data-song-id="${song.id}" 
                       ${isSelected ? 'checked disabled' : ''}>
                <div style="flex: 1;">
                    <div style="font-weight: 500;">${song.title || 'Sem título'}</div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary);">${song.artist || 'Artista desconhecido'}</div>
                    ${song.duration ? `<div style="font-size: 0.8rem; color: var(--text-tertiary);"><i class="fas fa-clock"></i> ${song.duration}</div>` : ''}
                </div>
                ${!isSelected ? `
                <button class="btn btn-sm btn-outline btn-add-song" data-song-id="${song.id}" 
                        style="padding: 2px 8px; font-size: 0.8rem;">
                    <i class="fas fa-plus"></i>
                </button>
                ` : ''}
            </div>
        </div>`;
    });
    
    html += '</div>';
    return html;
}



saveDateTimeForEdit(modal, date, time) {
    console.log('💾 Salvando horário para edição:', { date, time });
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        selections[date] = {
            time: time,
            description: '',
            members: {}
        };
    } else {
        selections[date].time = time;
    }
    
    modal.data('scaleSelections', selections);
}

saveDateDescriptionForEdit(modal, date, description) {
    console.log('💾 Salvando descrição para edição:', { date, description });
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        const defaultTime = modal.find(`.date-specific-time[data-date="${date}"]`).val() || 
                           modal.find('.monthly-scale-time').val() || 
                           '19:00';
        selections[date] = {
            time: defaultTime,
            description: description,
            members: {}
        };
    } else {
        selections[date].description = description;
    }
    
    modal.data('scaleSelections', selections);
}


setupDateEventsForEdit(modal) {
    console.log('🔧 Configurando eventos para datas em modo de edição');
    
    const self = this;
    
    // Configurar eventos de horário
    modal.off('change', '.date-specific-time').on('change', '.date-specific-time', function() {
        const date = $(this).data('date');
        const time = $(this).val();
        self.saveDateTimeForEdit(modal, date, time);
    });
    
    // Configurar eventos de descrição
    modal.off('input', '.date-specific-description').on('input', '.date-specific-description', function() {
        const date = $(this).data('date');
        const description = $(this).val().trim();
        self.saveDateDescriptionForEdit(modal, date, description);
    });
    
    // Configurar eventos de checkbox de membros
    modal.off('change', '.member-date-checkbox').on('change', '.member-date-checkbox', function() {
        const isChecked = $(this).is(':checked');
        const userId = $(this).data('user-id');
        const date = $(this).data('date');
        const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
        
        functionSelect.prop('disabled', !isChecked);
        if (!isChecked) {
            functionSelect.val('');
        }
        
        // Salvar seleção
        self.saveDateSelectionForEdit(modal, date, userId, isChecked, functionSelect.val());
        self.updateDateMembersCountForEdit(modal, date);
    });
    
    // Configurar eventos de função
    modal.off('change', '.member-date-function').on('change', '.member-date-function', function() {
        const userId = $(this).data('user-id');
        const date = $(this).data('date');
        const functionValue = $(this).val();
        const isChecked = modal.find(`.member-date-checkbox[data-date="${date}"][data-user-id="${userId}"]`).is(':checked');
        
        // Salvar seleção
        self.saveDateSelectionForEdit(modal, date, userId, isChecked, functionValue);
        self.updateDateMembersCountForEdit(modal, date);
    });
    
    // Configurar botão "Copiar para próxima data"
    modal.off('click', '.copy-to-next').on('click', '.copy-to-next', function() {
        const date = $(this).data('date');
        self.copyMembersToNextDateForEdit(modal, date);
    });
}

updateDateMembersCountForEdit(modal, date) {
    const dateSelector = date.replace(/-/g, '');
    const selectedCount = modal.find(`.member-date-checkbox[data-date="${date}"]:checked:not(:disabled)`).length;
    const assignedCount = modal.find(`.member-date-function[data-date="${date}"]:enabled option:selected[value!=""]`).length;
    
    // Atualizar badge
    modal.find(`.members-count-${dateSelector}`).text(selectedCount);
    
    // Atualizar contador no resumo
    modal.find(`.selected-count-${dateSelector}`).text(selectedCount);
    
    // Destacar se tem membros sem função
    if (selectedCount > 0 && assignedCount < selectedCount) {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--warning)');
    } else if (selectedCount > 0) {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--success)');
    } else {
        modal.find(`.date-scale-section[data-date="${date}"]`).css('border-color', 'var(--border)');
    }
}



saveDateSelectionForEdit(modal, date, userId, isSelected, functionId) {
    console.log('💾 Salvando seleção para edição:', { date, userId, isSelected, functionId });
    
    let selections = modal.data('scaleSelections');
    if (!selections) {
        selections = {};
        modal.data('scaleSelections', selections);
    }
    
    if (!selections[date]) {
        const defaultTime = modal.find(`.date-specific-time[data-date="${date}"]`).val() || 
                           modal.find('.monthly-scale-time').val() || 
                           '19:00';
        selections[date] = {
            time: defaultTime,
            description: '',
            members: {}
        };
    }
    
    if (isSelected && functionId && functionId !== '') {
        // Obter nome da função
        const functionSelect = modal.find(`.member-date-function[data-date="${date}"][data-user-id="${userId}"]`);
        const functionName = functionSelect.find('option:selected').text();
        
        selections[date].members[userId] = {
            id: parseInt(userId),
            function_id: functionId ? parseInt(functionId) : null,
            role: functionName || 'Participante',
            status: 'pending'
        };
        console.log('✅ Membro adicionado na edição:', selections[date].members[userId]);
    } else {
        // Remover membro
        delete selections[date].members[userId];
        console.log('❌ Membro removido na edição:', userId);
    }
    
    modal.data('scaleSelections', selections);
}

renderMembersListForDate(date, dateData, ministryMembers, ministryFunctions) {
    const savedMembers = dateData.members || {};
    let html = '';
    
    if (ministryMembers.length === 0) {
        return `
        <div class="alert alert-warning">
            <i class="fas fa-users-slash"></i>
            Nenhum membro neste ministério
        </div>`;
    }
    
    html += `
        <div class="date-members-list" data-date="${date}">
            <div class="members-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px; margin-top: 15px;">`;
    
    ministryMembers.forEach(user => {
        const savedMember = savedMembers[user.id] || savedMembers[user.id.toString()];
        const isChecked = !!savedMember;
        const savedFunctionId = savedMember ? (savedMember.function_id || savedMember.role) : '';
        
        // Verificar indisponibilidade
        const isUnavailable = this.isUserUnavailable(user, date);
        
        html += `
            <div class="member-date-item ${isUnavailable ? 'unavailable' : ''}" data-user-id="${user.id}">
                <div class="member-selection" style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" 
                           id="member-${date.replace(/-/g, '')}-${user.id}" 
                           class="member-date-checkbox" 
                           data-date="${date}"
                           data-user-id="${user.id}"
                           ${isUnavailable ? 'disabled' : ''}
                           ${isChecked ? 'checked' : ''}>
                    <label for="member-${date.replace(/-/g, '')}-${user.id}" class="member-label" style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="member-avatar-small">${this.getInitials(user.name)}</div>
                            <div>
                                <div class="member-name" style="font-weight: 500;">${user.name}</div>
                                <div class="member-skills" style="font-size: 0.85rem; color: var(--text-secondary);">
                                    ${user.skills?.join(', ') || 'Sem habilidades'}
                                </div>
                                ${isUnavailable ? 
                                    '<div class="unavailable-badge" style="color: var(--danger); font-size: 0.8rem;"><i class="fas fa-user-clock"></i> Indisponível</div>' : 
                                    ''}
                            </div>
                        </div>
                    </label>
                </div>
                
                <div class="member-function" style="margin-top: 10px;">
                    <select class="form-select member-date-function" 
                            data-date="${date}"
                            data-user-id="${user.id}"
                            ${isUnavailable || !isChecked ? 'disabled' : ''}
                            style="width: 100%; padding: 8px 12px; font-size: 0.9rem;">
                        <option value="">Selecione a função</option>
                        ${ministryFunctions.map(func => `
                            <option value="${func.id}" 
                                    ${savedFunctionId == func.id ? 'selected' : ''}
                                    data-color="${func.color || '#9147ff'}"
                                    style="${func.color ? `color: ${func.color};` : ''}">
                                ${func.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>
        `;
    });
    
    html += `
            </div>
            
            <div class="date-summary" style="margin-top: 20px; padding: 15px; background: var(--secondary-lighter); border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>Resumo da data:</strong>
                        <span class="selected-count-${date.replace(/-/g, '')}">${Object.keys(savedMembers).length}</span> membro(s) escalado(s)
                    </div>
                    <button class="btn btn-sm btn-outline copy-to-next" data-date="${date}">
                        <i class="fas fa-copy"></i> Copiar para próxima data
                    </button>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

forceLoadMembers(modal) {
    console.log('🔧 Forçando carregamento de membros...');
    this.loadMinistryMembersForWizard(modal);
}

// No método updateReviewStep(), adicione no início:
debugAllModalData(modal) {
    console.log('🔍 DEBUG - Todos os dados do modal:');
    console.log('📝 PASSO 3 - Campos:');
    console.log('- Evento:', modal.find('#monthlyScaleEvent').val());
    console.log('- Hora:', modal.find('#monthlyScaleTime').val());
    console.log('- Descrição:', modal.find('#monthlyScaleDescription').val());
    console.log('📅 PASSO 2 - Datas selecionadas:', modal.find('.calendar-day.selected').length);
    console.log('👥 PASSO 3 - Seleções salvas:', modal.data('scaleSelections'));
}

updateReviewStep(modal) {
    console.log('📋 Atualizando passo de revisão...');
    
    // Debug primeiro
    this.debugAllModalData(modal);
    
    // 🔥 CORREÇÃO: Buscar valores dos campos diretamente
    const event = modal.find('.monthly-scale-event').val();
    const time = modal.find('.monthly-scale-time').val();
    const month = modal.find('#monthlyScaleMonth').val();
    const ministryId = modal.find('#monthlyScaleMinistry').val();
    const description = modal.find('.monthly-scale-description').val();
    

    console.log('✅ Dados coletados:', {
        event,
        time,
        month,
        ministryId,
        description
    });
    
    // Obter seleções salvas
    const selections = modal.data('scaleSelections') || {};
    
    // Obter datas selecionadas (do calendário)
    const selectedDates = [];
    modal.find('.calendar-day.selected').each(function() {
        selectedDates.push($(this).data('date'));
    });
    
    console.log('📅 Datas do calendário:', selectedDates);
    
    // Se não encontrou datas no calendário, tentar das seleções
    if (selectedDates.length === 0) {
        selectedDates.push(...Object.keys(selections));
        console.log('📅 Datas das seleções:', selectedDates);
    }
    
    selectedDates.sort();
    
    // Obter nome do ministério
    const ministry = this.data.ministries.find(m => m.id == ministryId);
    
    // Calcular estatísticas
    let totalSelections = 0;
    const uniqueMembers = new Set();
    
    selectedDates.forEach(date => {
        const dateData = selections[date];
        if (dateData && dateData.members) {
            const memberCount = Object.keys(dateData.members).length;
            totalSelections += memberCount;
            
            Object.keys(dateData.members).forEach(memberId => {
                uniqueMembers.add(memberId);
            });
        }
    });
    
    // 🔥 CORREÇÃO: Formatar mês
    const formatMonthYear = (monthString) => {
        if (!monthString) return 'Não especificado';
        try {
            const [year, month] = monthString.split('-');
            const date = new Date(year, month - 1, 1);
            return date.toLocaleDateString('pt-BR', { 
                month: 'long', 
                year: 'numeric' 
            }).replace(/^\w/, c => c.toUpperCase());
        } catch (e) {
            return monthString;
        }
    };
    
    // 🔥 CORREÇÃO: Atualizar elementos com verificação
    const reviewMonth = modal.find('#reviewMonth');
    const reviewMinistry = modal.find('#reviewMinistry');
    const reviewEvent = modal.find('#reviewEvent');
    const reviewTime = modal.find('#reviewTime');
    const reviewDatesCount = modal.find('#reviewDatesCount');
    const reviewMembersCount = modal.find('#reviewMembersCount');
    
    if (reviewMonth.length) reviewMonth.text(formatMonthYear(month));
    if (reviewMinistry.length) reviewMinistry.text(ministry ? ministry.name : 'Não especificado');
    if (reviewEvent.length) reviewEvent.text(event || 'Não especificado');
    if (reviewTime.length) reviewTime.text(time || 'Não especificado');
    if (reviewDatesCount.length) reviewDatesCount.text(`${selectedDates.length} data(s)`);
    if (reviewMembersCount.length) reviewMembersCount.text(`${uniqueMembers.size} membro(s) únicos`);
    
    // Atualizar lista de datas
    const datesList = modal.find('#datesListPreview');
    
    if (selectedDates.length === 0) {
        datesList.html(`
            <div class="alert alert-warning" style="margin-top: 15px;">
                <i class="fas fa-exclamation-triangle"></i>
                Nenhuma data selecionada
            </div>
        `);
        return;
    }
    
    let datesHtml = '<div class="review-dates-container">';
    
    selectedDates.forEach((date, index) => {
        const dateData = selections[date] || {};
        const dateObj = new Date(date);
        const formattedDate = this.formatDate(date);
        const dayOfWeek = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
        const memberCount = dateData.members ? Object.keys(dateData.members).length : 0;
        const specificTime = dateData.time || time || '19:00';
        
        datesHtml += `
        <div class="review-date-item">
            <div class="date-header">
                <div class="date-info">
                    <div class="date-number">${index + 1}</div>
                    <div>
                        <div class="date-main">${formattedDate}</div>
                        <div class="date-weekday">${dayOfWeek}</div>
                    </div>
                </div>
                <div class="date-stats">
                    <div class="date-time">
                        <i class="fas fa-clock"></i> ${specificTime}
                    </div>
                    <div class="date-members-count ${memberCount > 0 ? 'has-members' : ''}">
                        <i class="fas fa-users"></i> ${memberCount} membro(s)
                    </div>
                </div>
            </div>
            
            ${memberCount > 0 ? `
            <div class="date-members-list">
                <div class="members-title">Membros escalados:</div>
                <div class="members-grid">
            ` : `
            <div class="no-members">
                <i class="fas fa-user-slash"></i> Nenhum membro escalado
            </div>
            `}
            
            ${memberCount > 0 ? 
                Object.values(dateData.members).map(member => {
                    const user = this.data.users.find(u => u.id === member.id);
                    if (!user) return '';
                    
                    return `
                    <div class="member-review-item">
                        <div class="member-avatar">${this.getInitials(user.name)}</div>
                        <div class="member-info">
                            <div class="member-name">${user.name}</div>
                            <div class="member-role">${member.role}</div>
                        </div>
                    </div>
                    `;
                }).join('') : ''}
            
            ${memberCount > 0 ? '</div></div>' : ''}
        </div>`;
    });
    
    datesHtml += '</div>';
    datesList.html(datesHtml);
    
    console.log('✅ Revisão atualizada!');
}
// Método auxiliar para formatar mês/ano
formatMonthYear(monthString) {
    if (!monthString) return '';
    const [year, month] = monthString.split('-');
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

validateScaleData(selections, selectedDates) {
    const errors = [];
    
    selectedDates.forEach(date => {
        const dateData = selections[date] || {};
        
        // Verificar se músicas têm tom definido (opcional, apenas aviso)
        if (dateData.songs && dateData.songs.length > 0) {
            const songsWithoutKey = dateData.songs.filter(song => !song.key || song.key.trim() === '');
            if (songsWithoutKey.length > 0) {
                errors.push({
                    date: date,
                    type: 'warning',
                    message: `${songsWithoutKey.length} música(s) sem tom definido na data ${this.formatDate(date)}`
                });
            }
        }
        
        // Verificar se há membros sem função
        if (dateData.members) {
            const membersWithoutFunction = Object.values(dateData.members).filter(member => 
                !member.function_id || !member.role
            );
            if (membersWithoutFunction.length > 0) {
                errors.push({
                    date: date,
                    type: 'error',
                    message: `${membersWithoutFunction.length} membro(s) sem função definida na data ${this.formatDate(date)}`
                });
            }
        }
    });
    
    return errors;
}

async createMonthlyScale(modal) {
    try {
        console.log('🚀 Iniciando criação de escala mensal...');
        
        // Debug: mostrar dados atuais
        const debugSelections = modal.data('scaleSelections');
        console.log('🔍 Dados das seleções completas:', JSON.stringify(debugSelections, null, 2));
        
        // Obter dados básicos
        const event = modal.find('.monthly-scale-event').val().trim();
        const month = modal.find('#monthlyScaleMonth').val();
        const ministryId = modal.find('#monthlyScaleMinistry').val();
        const generalDescription = modal.find('.monthly-scale-description').val().trim();
         
        
        console.log('📋 Dados básicos:', {
            event,
            month,
            ministryId,
            generalDescription
        });
        
        if (!event || !month || !ministryId) {
            this.showToast('Preencha todos os campos obrigatórios!', 'error');
            return;
        }
        
        // Coletar datas selecionadas (do calendário)
        const selectedDates = [];
        modal.find('.calendar-day.selected').each(function() {
            selectedDates.push($(this).data('date'));
        });
        
        // Se não encontrou no calendário, tentar das seleções salvas
        if (selectedDates.length === 0 && debugSelections) {
            selectedDates.push(...Object.keys(debugSelections));
        }
        
        if (selectedDates.length === 0) {
            this.showToast('Selecione pelo menos uma data!', 'error');
            return;
        }
        
        selectedDates.sort();
        console.log('📅 Datas selecionadas:', selectedDates);
        
        // Obter seleções salvas
        const selections = modal.data('scaleSelections') || {};
        
        // Preparar escalas individuais por data
        const scalesData = [];
        
        selectedDates.forEach(date => {
            const dateData = selections[date] || {};
            
            // CORREÇÃO: Garantir que members seja uma lista válida
            let membersList = [];
            if (dateData.members && typeof dateData.members === 'object') {
                // Converter objeto para array
                membersList = Object.values(dateData.members);
            } else if (Array.isArray(dateData.members)) {
                membersList = dateData.members;
            }
            
            // Filtrar membros com função definida
            const validMembers = membersList.filter(member => 
                member && member.id && member.role && member.role.trim() !== ''
            );
            
            if (validMembers.length === 0) {
                console.warn(`⚠️ Nenhum membro válido para data ${date}`);
                return; // Pular esta data
            }
            
            const scaleData = {
                event: event,
                date: date, // String no formato YYYY-MM-DD mikao
                time: dateData.time || modal.find('.monthly-scale-time').val() || '19:00',
                ministry: parseInt(ministryId),
                description: dateData.description || '',
                status: 'pending',
                scale_type: 'monthly_group',
                scale_group: `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                month_reference: month,
                members: validMembers, // Lista de objetos
                songs: dateData.songs || [],
                observations: dateData.observations || [],
                music_key: dateData.music_key || '',
                send_lyrics: dateData.send_lyrics !== false
            };
            
            // Log para debug
            console.log(`📊 Dados show ${scaleData}`);
            
            scalesData.push(scaleData);
        });
        
        if (scalesData.length === 0) {
            this.showToast('Nenhuma data com membros válidos selecionados!', 'error');
            return;
        }

        const scaleWithoutObs = scalesData.find(
            scale => !scale.description || scale.description.length === 0
        );

        if (scaleWithoutObs) {
            this.showToast(
                `É necessário informar uma descrição para os eventos!!`,
                'error'
            );
            return;
        }

        if (parseInt(ministryId) === 1){
        
            const scaleWithoutSongs = scalesData.find(
                scale => !Array.isArray(scale.songs) || scale.songs.length === 0
            );

            if (scaleWithoutSongs) {
                this.showToast(
                    `É necessário informar musicas para o repertório da data ${scaleWithoutSongs.date}!!`,
                    'error'
                );
                return;
            }

            const scaleWithSongWithoutKey = scalesData.find(scale =>
                !Array.isArray(scale.songs) ||
                scale.songs.some(song =>
                    !song.key || song.key.toString().trim() === ''
                )
            );

            if (scaleWithSongWithoutKey) {
                this.showToast(
                    `A data ${scaleWithSongWithoutKey.date} possui música sem tom definido`,
                    'error'
                );
                return;
            }
       }
        
        console.log('📤 Dados finais para envio:', JSON.stringify(scalesData, null, 2));
        
        this.showLoading('Criando escalas mensais...');
        
        // Enviar em lote
        const response = await this.apiCall('/api/scales/monthly/batch', 'POST', {
            scales: scalesData,
            send_notifications: true
        });
        
        if (response && response.success) {
            const createdCount = response.data.created_count || scalesData.length;
            const skippedDates = response.data.skipped_dates || [];
            
            let message = `${createdCount} escala(s) criada(s) com sucesso!`;
            if (skippedDates.length > 0) {
                const skippedList = skippedDates.map(s => `${s.date}: ${s.reason}`).join(', ');
                message += ` ${skippedDates.length} data(s) ignorada(s).`;
                console.log('📋 Datas ignoradas:', skippedList);
            }
            
            this.showToast(message, 'success');
            
            // Fechar modal
            modal.remove();
            
            // Recarregar dados
            setTimeout(async () => {
                await this.loadDataFromAPI();
                
                // Se estiver na dashboard, recarregar
                if (this.state.currentNav === 'home') {
                    this.loadDashboard();
                }
            }, 1000);
            
        } else {
            throw new Error(response?.error || 'Erro ao criar escalas');
        }
        
    } catch (error) {
        console.error('❌ Erro ao criar escala mensal:', error);
        this.showToast('Erro ao criar escala mensal: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}
 // MELHORAR TAMBÉM A LEGENDA DO CALENDÁRIO
showCalendar() {
    const content = `
    <div class="calendar-section">
        <div class="calendar-header">
            <h2 class="calendar-title">Calendário</h2>
            <div class="calendar-nav">
                <button class="calendar-nav-btn" id="prevMonth">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="calendar-month" id="currentMonth">
                    ${this.getMonthName(this.state.currentMonth)} ${this.state.currentYear}
                </div>
                <button class="calendar-nav-btn" id="nextMonth">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        
        <div class="calendar-info">
            <div class="calendar-legend">
                <div class="legend-item">
                    <div class="legend-color today"></div>
                    <span>Hoje</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color has-events"></div>
                    <span>Com escala</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color has-events-multiple"></div>
                    <span>Múltiplas escalas</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color unavailable-pending"></div>
                    <span>Indisponível (Pendente)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color unavailable-approved"></div>
                    <span>Indisponível (Aprovado)</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color unavailable-rejected"></div>
                    <span>Indisponível (Rejeitado)</span>
                </div>
                ${this.isLeader() ? `
                <div class="legend-item">
                    <div class="legend-color has-unavailable-members"></div>
                    <span>Membros indisponíveis</span>
                </div>
                ` : ''}
            </div>
            <p class="calendar-instruction">
                Passe o mouse sobre os dias com escalas para ver detalhes
            </p>
        </div>
        
        <div class="calendar-container">
            <div class="calendar-weekdays">
                <div class="calendar-weekday">Dom</div>
                <div class="calendar-weekday">Seg</div>
                <div class="calendar-weekday">Ter</div>
                <div class="calendar-weekday">Qua</div>
                <div class="calendar-weekday">Qui</div>
                <div class="calendar-weekday">Sex</div>
                <div class="calendar-weekday">Sáb</div>
            </div>
            <div class="calendar-days" id="calendarDays"></div>
        </div>
        
        <!-- Botão flutuante para solicitar indisponibilidade -->
        <div class="floating-action-btn" id="requestUnavailabilityBtn" style="display: none;">
            <i class="fas fa-user-clock"></i>
        </div>
    </div>`;

    $('#appContent').html(content);
    this.generateCalendar();

    $('#prevMonth').click(() => this.prevMonth());
    $('#nextMonth').click(() => this.nextMonth());
    
    this.setupCalendarEventListeners();
}
    generateCalendar() {
    const firstDay = new Date(this.state.currentYear, this.state.currentMonth, 1);
    const lastDay = new Date(this.state.currentYear, this.state.currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();

    const calendarDays = $('#calendarDays');
    calendarDays.empty();

    const today = new Date();
    const todayFormatted = today.toISOString().split('T')[0];

    // ✅ OBTER ESCALAS DO USUÁRIO (JÁ FILTRADAS PELO BACKEND)
    let userScales = this.data.scales;

    // Se for membro comum, filtrar apenas escalas onde está incluído
    if (this.data.currentUser?.role === 'membro') {
        userScales = this.data.scales.filter(scale => {
            const isMember = scale.members && scale.members.some(m => m.id === this.data.currentUser.id);
            return isMember;
        });
    }
    // Se for líder, o backend já filtrou, mas podemos fazer verificação extra
    else if (this.data.currentUser?.role === 'lider') {
        // Verificar se as escalas são dos ministérios liderados
        const ledMinistryIds = this.getUserLedMinistryIds();
        if (ledMinistryIds.length > 0) {
            userScales = this.data.scales.filter(scale => 
                ledMinistryIds.includes(parseInt(scale.ministry))
            );
        }
    }

    console.log('📅 Escalas para calendário:', userScales.length);
    console.log('👤 Usuário role:', this.data.currentUser?.role);

    // Dias do mês anterior
    for (let i = 0; i < startingDay; i++) {
        const prevMonthLastDay = new Date(this.state.currentYear, this.state.currentMonth, 0).getDate();
        const dayNumber = prevMonthLastDay - startingDay + i + 1;
        calendarDays.append(`<div class="calendar-day other-month">${dayNumber}</div>`);
    }

    // Dias do mês atual
    for (let i = 1; i <= daysInMonth; i++) {
        const dateStr = `${this.state.currentYear}-${(this.state.currentMonth + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
        
        // ✅ Buscar escalas FILTRADAS para este dia
        const dayScales = userScales.filter(scale => scale.date === dateStr);
        const hasEvents = dayScales.length > 0;
        
        const userUnavailability = this.getUserUnavailabilityForDate(dateStr);
        const membersUnavailability = this.isLeader() ? this.getMembersUnavailabilityForDate(dateStr) : [];

        let dayClass = 'calendar-day current-month';
        if (dateStr === todayFormatted) dayClass += ' today';
        if (hasEvents) dayClass += ' has-events';
        
        // CORREÇÃO DAS CORES - Prioridade: Aprovado > Pendente > Rejeitado
        if (userUnavailability.length > 0) {
            const period = userUnavailability[0];
            if (period.status === 'approved') {
                dayClass += ' unavailable-approved';
            } else if (period.status === 'pending') {
                dayClass += ' unavailable-pending';
            } else if (period.status === 'rejected') {
                dayClass += ' unavailable-rejected';
            }
        }
        
        if (this.isLeader() && membersUnavailability.length > 0) {
            dayClass += ' has-unavailable-members';
        }

        // CONTEÚDO MELHORADO PARA O DIA
        const dayContent = `
            <div class="calendar-day-number">${i}</div>
            ${hasEvents ? `
                <div class="events-indicator">
                    <div class="events-count">${dayScales.length}</div>
                    <div class="events-tooltip">
                        <strong>${dayScales.length} escala(s)</strong>
                        ${dayScales.map(scale => {
                            const ministry = this.data.ministries.find(m => m.id === parseInt(scale.ministry));
                            return `
                            <div class="event-tooltip-item">
                                <span class="event-time">${scale.time}</span>
                                <span class="event-name">${scale.event}</span>
                                ${ministry ? `<span class="event-ministry">${ministry.name}</span>` : ''}
                            </div>
                        `}).join('')}
                    </div>
                </div>
            ` : ''}
            ${userUnavailability.length > 0 ? '<div class="unavailability-indicator"></div>' : ''}
            ${this.isLeader() && membersUnavailability.length > 0 ? 
                `<div class="members-unavailable-indicator">${membersUnavailability.length}</div>` : ''}
        `;

        calendarDays.append(`
        <div class="${dayClass}" data-date="${dateStr}">
            ${dayContent}
        </div>`);
    }

    const totalCells = 42;
    const remainingCells = totalCells - (startingDay + daysInMonth);
    for (let i = 1; i <= remainingCells; i++) {
        calendarDays.append(`<div class="calendar-day other-month">${i}</div>`);
    }
}

// Adicione este método à sua classe
getUserLedMinistryIds() {
    if (!this.data.currentUser) return [];
    
    const ledMinistries = this.data.ministries.filter(ministry => 
        parseInt(ministry.leader) === this.data.currentUser.id
    );
    
    return ledMinistries.map(m => m.id);
}
// Novos métodos auxiliares
getUserUnavailabilityForDate(date) {
    if (!this.data.currentUser || !this.data.currentUser.unavailability) return [];
    
    const targetDate = new Date(date);
    return this.data.currentUser.unavailability.filter(period => {
        const startDate = new Date(period.start_date || period.start);
        const endDate = new Date(period.end_date || period.end);
        return targetDate >= startDate && targetDate <= endDate;
    });
}

getMembersUnavailabilityForDate(date) {
    if (!this.isLeader()) return [];
    
    const targetDate = new Date(date);
    const unavailableMembers = [];
    
    this.data.users.forEach(user => {
        if (user.id === this.data.currentUser.id) return; // Pular o próprio usuário
        
        if (user.unavailability && user.unavailability.length > 0) {
            const isUnavailable = user.unavailability.some(period => {
                const startDate = new Date(period.start_date || period.start);
                const endDate = new Date(period.end_date || period.end);
                const status = period.status;
                return targetDate >= startDate && targetDate <= endDate && status === 'approved';
            });
            
            if (isUnavailable) {
                unavailableMembers.push(user);
            }
        }
    });
    
    return unavailableMembers;
}

    showEventsForDate(date) {
    const events = this.data.scales.filter(scale => scale.date === date);
    const userUnavailability = this.getUserUnavailabilityForDate(date);
    const membersUnavailability = this.isLeader() ? this.getMembersUnavailabilityForDate(date) : [];

    // Se for líder e houver membros indisponíveis, mostrar modal de líder
    if (this.isLeader() && membersUnavailability.length > 0) {
        this.showLeaderUnavailabilityModal(date, membersUnavailability);
    }
    // Se o usuário tem própria indisponibilidade, mostrar detalhes
    else if (userUnavailability.length > 0) {
        this.showUserUnavailabilityModal(date, userUnavailability);
    }
    // Se não tem indisponibilidade, mostrar modal para solicitar
    else {
        this.showUnavailabilityModal(date);
    }
}

// Modal para líder ver membros indisponíveis
showLeaderUnavailabilityModal(date, unavailableMembers) {
    // Remover qualquer modal existente
    $('.modal').remove();
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Membros Indisponíveis</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="unavailability-details">
                    <div class="detail-header">
                        <i class="fas fa-calendar-day"></i>
                        <span>Data: ${this.formatDate(date)}</span>
                        <span class="members-count">${unavailableMembers.length} membro(s)</span>
                    </div>
                    <div class="members-list">
                        ${unavailableMembers.map(member => {
                            const unavailability = member.unavailability.find(period => {
                                const startDate = new Date(period.start_date || period.start);
                                const endDate = new Date(period.end_date || period.end);
                                const targetDate = new Date(date);
                                return targetDate >= startDate && targetDate <= endDate;
                            });
                            
                            return `
                            <div class="member-unavailability-item">
                                <div class="member-avatar">${this.getInitials(member.name)}</div>
                                <div class="member-details">
                                    <div class="member-name">${member.name}</div>
                                    <div class="member-contact">${member.email} • ${member.phone || 'Sem telefone'}</div>
                                    ${unavailability ? `
                                    <div class="unavailability-reason">
                                        <strong>Motivo:</strong> ${unavailability.reason}
                                    </div>
                                    <div class="unavailability-period">
                                        <strong>Período:</strong> ${this.formatDate(unavailability.start_date || unavailability.start)} até ${this.formatDate(unavailability.end_date || unavailability.end)}
                                    </div>
                                    ` : ''}
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary btn-close-modal">Fechar</button>
                    <button class="btn btn-primary btn-view-pending">
                        <i class="fas fa-tasks"></i> Ver Solicitações Pendentes
                    </button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Event listeners
    modal.find('.modal-close, .btn-close-modal').on('click', () => {
        modal.remove();
    });
    
    modal.find('.btn-view-pending').on('click', () => {
        modal.remove();
        this.loadPendingRequestsScreen();
    });
    
    // Event listener para fechar modal ao clicar no fundo
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
    
    modal.show();
}

// Método auxiliar para buscar nome do usuário
getUserName(userId) {
    const user = this.data.users.find(u => u.id === userId);
    return user ? user.name : 'Usuário desconhecido';
}

// Modal para o usuário ver suas próprias indisponibilidades
// Modal para o usuário ver suas próprias indisponibilidades
showUserUnavailabilityModal(date, unavailabilityList) {
    // Remover qualquer modal existente
    $('.modal').remove();
    
    const modal = $(`
    <div class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Minhas Indisponibilidades</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="unavailability-details">
                    <div class="detail-header">
                        <i class="fas fa-calendar-day"></i>
                        <span>Data: ${this.formatDate(date)}</span>
                    </div>
                    
                    ${unavailabilityList.map(period => `
                    <div class="unavailability-item status-${period.status}">
                        <div class="unavailability-status">
                            <span class="status-badge status-${period.status}">
                                ${this.getStatusText(period.status)}
                            </span>
                        </div>
                        <div class="unavailability-info">
                            <div class="info-row">
                                <label>Período:</label>
                                <span>${this.formatDate(period.start_date || period.start)} até ${this.formatDate(period.end_date || period.end)}</span>
                            </div>
                            <div class="info-row">
                                <label>Motivo:</label>
                                <span>${period.reason}</span>
                            </div>
                            ${period.comment ? `
                            <div class="info-row">
                                <label>Comentário do líder:</label>
                                <span>${period.comment}</span>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                    `).join('')}
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-secondary btn-close-modal">Fechar</button>
                    ${unavailabilityList.some(p => p.status === 'pending') ? `
                    <button class="btn btn-warning btn-cancel-request">Cancelar Solicitação</button>
                    ` : ''}
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');
    
    // Único event listener para fechar
    modal.find('.modal-close, .btn-close-modal').on('click', () => {
        modal.remove();
    });
    
    // Event listener para cancelar solicitação
    if (unavailabilityList.some(p => p.status === 'pending')) {
        modal.find('.btn-cancel-request').on('click', () => {
            this.cancelUnavailabilityRequest(unavailabilityList[0].id);
            modal.remove();
        });
    }
    
    // Event listener para fechar modal ao clicar no fundo
   // modal.on('click', (e) => {
   //     if (e.target === modal[0]) {
   //         modal.remove();
   //     }
   // });
    
    modal.show();
}




    prevMonth() {
        this.state.currentMonth--;
        if (this.state.currentMonth < 0) {
            this.state.currentMonth = 11;
            this.state.currentYear--;
        }
        this.updateCalendar();
    }

    nextMonth() {
        this.state.currentMonth++;
        if (this.state.currentMonth > 11) {
            this.state.currentMonth = 0;
            this.state.currentYear++;
        }
        this.updateCalendar();
    }

    updateCalendar() {
        $('#calendarDays').empty();
        this.generateCalendar();
        $('#currentMonth').text(`${this.getMonthName(this.state.currentMonth)} ${this.state.currentYear}`);
    }

    getMonthName(month) {
        const months = [
            'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
            'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
        ];
        return months[month];
    }

  loadPendingRequestsScreen() {
    if (!this.isLeader()) {
        this.showToast('Acesso negado', 'error');
        return this.loadDashboard();
    }

    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Solicitações de Indisponibilidade</h2>
            <span class="view-all" id="refreshRequests">Atualizar</span>
        </div>
        
        <div class="card">
            <div id="pendingRequestsList">
                <div style="text-align: center; padding: 20px;">
                    <div class="loading-spinner"></div>
                    <p>Carregando solicitações...</p>
                </div>
            </div>
        </div>
    </div>`;

    $('#appContent').html(content);
    
    // Limpar badge quando acessar a tela
    this.updatePendingRequestsBadge([]);
    
    this.loadPendingRequestsFromAPI();

    $(document).off('click', '#refreshRequests').on('click', '#refreshRequests', () => {
        this.loadPendingRequestsFromAPI();
    });
}

    async loadPendingRequestsFromAPI() {
        try {
            this.showLoading('Carregando solicitações...');
            const response = await this.apiCall('/unavailability/pending');
            
            if (response && response.success) {
                let requestsData = [];
                if (response.data && response.data.pending_requests) {
                    requestsData = response.data.pending_requests;
                }
                this.renderPendingRequests(requestsData);
            } else {
                this.showRequestsError();
            }
        } catch (error) {
            this.showRequestsError('Erro de conexão: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    renderPendingRequests(requests) {
        const container = $('#pendingRequestsList');
        if (!requests || requests.length === 0) {
            container.html(`
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-inbox" style="font-size: 3rem; color: var(--text-secondary); margin-bottom: 15px;"></i>
                <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhuma solicitação pendente</h3>
                <p style="color: var(--text-tertiary);">Todas as solicitações foram processadas.</p>
            </div>`);
            return;
        }

        let requestsHtml = '';
        requests.forEach((request) => {
            const startDate = this.formatDate(request.start_date);
            const endDate = this.formatDate(request.end_date);
            const createdAt = this.formatDateTime(request.created_at);
            
            requestsHtml += `
            <div class="request-item" data-request-id="${request.id}">
                <div class="request-header">
                    <div class="request-member-info">
                        <div class="request-member-avatar">${this.getInitials(request.member_name)}</div>
                        <div class="request-member-details">
                            <div class="request-member-name">${request.member_name}</div>
                            <div class="request-member-contact">
                                ${request.member_email} • ${request.member_phone}
                            </div>
                        </div>
                    </div>
                    <div class="request-date-badge">
                        <i class="fas fa-calendar"></i>
                        ${startDate} ${startDate !== endDate ? `até ${endDate}` : ''}
                    </div>
                </div>
                
                <div class="request-reason">
                    <strong><i class="fas fa-comment"></i> Motivo:</strong> ${request.reason}
                </div>
                
                <div class="request-meta">
                    <span class="request-meta-item">
                        <i class="fas fa-clock"></i> Solicitado em: ${createdAt}
                    </span>
                    <span class="request-meta-item">
                        <i class="fas fa-hashtag"></i> ID: ${request.id}
                    </span>
                </div>
                
                <div class="request-actions">
                    <button class="btn btn-success btn-approve" data-request-id="${request.id}">
                        <i class="fas fa-check"></i> Aprovar
                    </button>
                    <button class="btn btn-danger btn-reject" data-request-id="${request.id}">
                        <i class="fas fa-times"></i> Rejeitar
                    </button>
                </div>
            </div>`;
        });

        container.html(requestsHtml);
        this.setupRequestEventListeners();
    }

    setupRequestEventListeners() {
        $(document).off('click', '.btn-approve').on('click', '.btn-approve', (e) => {
            const requestId = $(e.currentTarget).data('request-id');
            this.processRequest(requestId, 'approve');
        });

        $(document).off('click', '.btn-reject').on('click', '.btn-reject', (e) => {
            const requestId = $(e.currentTarget).data('request-id');
            this.processRequest(requestId, 'reject');
        });
    }
   
   
getDateSelectedSongs(date) {
    // Verificar se há seleções salvas no modal atual
    const modal = $('.modal').first();
    if (modal.length === 0) return [];
    
    const selections = modal.data('scaleSelections');
    if (!selections || !selections[date]) return [];
    
    return selections[date].songs || [];
}

saveDateSelectedSongs(modal, date, songs) {
    let selections = modal.data('scaleSelections') || {};
    
    if (!selections[date]) {
        selections[date] = {
            time: modal.find(`.date-specific-time[data-date="${date}"]`).val() || '19:00',
            description: modal.find(`.date-specific-description[data-date="${date}"]`).val() || '',
            members: {},
            songs: [],
            send_lyrics: true
        };
    }
    
    // Para cada música, manter estrutura com id, order e key (inicialmente vazio)
    selections[date].songs = songs.map(song => ({
        id: song.id,
        order: song.order,
        key: song.key || '' // Campo para tom da música
    }));
    
    modal.data('scaleSelections', selections);
    
    // Atualizar visualização
    this.updateDateSongsPreview(modal, date, selections[date].songs);
}

   async processRequest(requestId, action) {
    const comment = prompt(`Digite um comentário para ${action === 'approve' ? 'aprovar' : 'rejeitar'} esta solicitação (opcional):`);
    
    if (action === 'reject' && (!comment || comment.trim() === '')) {
        const requiredComment = prompt(`Para rejeitar é necessário informar o motivo:`);
        if (!requiredComment || requiredComment.trim() === '') {
            this.showToast('É necessário informar o motivo da rejeição!', 'error');
            return;
        }
    }

    try {
        this.showLoading(`Processando solicitação...`);
        const response = await this.apiCall('/unavailability/process', 'PUT', {
            requestId: requestId,
            action: action,
            comment: comment ? comment.trim() : null
        });

        if (response && response.success) {
            const message = action === 'approve' ? 'Solicitação aprovada com sucesso!' : 'Solicitação rejeitada com sucesso!';
            this.showToast(message);
            
            // Atualizar a lista e o badge
            await this.loadPendingRequestsFromAPI();
            
            // Atualizar o badge global
            this.checkPendingRequests();
        } else {
            this.showToast(response?.error || 'Erro ao processar solicitação', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão com o servidor', 'error');
    } finally {
        this.hideLoading();
    }
}
    showRequestsError(message = 'Erro ao carregar solicitações') {
        $('#pendingRequestsList').html(`
        <div style="text-align: center; padding: 40px; color: var(--danger);">
            <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px;"></i>
            <h3 style="margin-bottom: 10px;">Erro ao carregar solicitações</h3>
            <p>${message}</p>
            <button class="btn btn-primary" onclick="churchTimeApp.loadPendingRequestsFromAPI()" style="margin-top: 15px;">
                Tentar Novamente
            </button>
        </div>`);
    }

   showNotifications() {
    const notifications = this.data.currentUser.notifications || [];
    const unreadCount = notifications.filter(n => n.is_read === 0 || n.is_read === false).length;
    
    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Notificações</h2>
            <div class="header-actions">
                ${unreadCount > 0 ? `
                    <span class="view-all" id="markAllRead">
                        <i class="fas fa-check-double"></i> Marcar Todas como Lidas
                    </span>
                ` : ''}
                <span class="view-all" id="clearNotifications" style="margin-left: 10px;">
                    <i class="fas fa-trash"></i> Limpar Tudo
                </span>
                <span class="view-all" id="refreshNotifications" style="margin-left: 10px;">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </span>
            </div>
        </div>
        
        ${unreadCount > 0 ? `
            <div class="notification-alert">
                <i class="fas fa-bell"></i>
                Você tem ${unreadCount} notificação(ões) não lida(s)
            </div>
        ` : ''}
        
        <div class="card">
            ${notifications.length > 0 ?
            notifications.map(notification => {
                const isUnread = notification.is_read === 0 || notification.is_read === false;
                return `
                    <div class="list-item ${isUnread ? 'unread' : ''}" data-notification-id="${notification.id}">
                        <div class="item-avatar" style="background-color: ${this.getNotificationColor(notification.type)};">
                            <i class="${this.getNotificationIcon(notification.type)}"></i>
                        </div>
                        <div class="item-content">
                            <div class="item-title">${notification.title || 'Notificação'}</div>
                            <div class="item-subtitle">${notification.message || 'Sem mensagem'}</div>
                            <div class="item-meta">
                                <span class="item-date">${this.formatDateTime(notification.created_at)}</span>
                                ${isUnread ? '<span class="unread-dot" title="Não lida"></span>' : ''}
                            </div>
                        </div>
                    </div>`;
            }).join('') :
            `
                <div class="card-content" style="text-align: center; padding: 40px;">
                    <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
                    <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhuma notificação</h3>
                    <p style="color: var(--text-tertiary);">Você não tem notificações no momento.</p>
                </div>
            `}
        </div>
    </div>`;

    $('#appContent').html(content);

    // Event listeners
    $('#markAllRead').click(() => this.markAllNotificationsAsRead());
    $('#clearNotifications').click(() => this.clearAllNotifications());
    $('#refreshNotifications').click(() => this.checkAndShowNotifications());
    
    // Marcar como lida ao clicar
    $('.list-item[data-notification-id]').click((e) => {
        const notificationId = $(e.currentTarget).data('notification-id');
        this.markNotificationAsRead(notificationId);
    });
}

// Novo método para marcar notificação individual como lida
async markNotificationAsRead(notificationId) {
    try {
        const response = await this.apiCall('/notifications/read', 'PUT', {
            notificationId: notificationId
        });
        
        if (response && response.success) {
            // Atualizar localmente
            const notification = this.data.currentUser.notifications.find(n => n.id === notificationId);
            if (notification) {
                notification.is_read = true;
            }
            
            // Atualizar a interface
            this.updateNotificationBadge(this.data.currentUser.notifications);
            this.showNotifications(); // Recarregar a lista
        }
    } catch (error) {
        console.error('Erro ao marcar notificação como lida:', error);
    }
}
   // Corrigir a função de marcar notificações como lidas
async markAllNotificationsAsRead() {
    try {
        this.showLoading('Marcando como lidas...');
        const response = await this.apiCall('/notifications/read-all', 'PUT').catch(error => {
            console.warn('⚠️ Erro ao marcar notificações como lidas:', error);
            return { success: false, error: error.message };
        });
        
        if (response && response.success) {
            this.showToast('Todas as notificações marcadas como lidas!');
            // Atualizar localmente
            if (this.data.currentUser.notifications) {
                this.data.currentUser.notifications.forEach(notification => {
                    notification.is_read = true;
                });
            }
            this.updateNotificationBadge(this.data.currentUser.notifications || []);
            this.showNotifications();
        } else {
            this.showToast(response?.error || 'Erro ao marcar notificações como lidas', 'error');
        }
    } catch (error) {
        this.showToast('Erro ao marcar notificações como lidas', 'error');
    } finally {
        this.hideLoading();
    }
}

    async clearAllNotifications() {
        if (confirm('Tem certeza que deseja limpar todas as notificações?')) {
            try {
                this.showLoading('Limpando notificações...');
                const response = await this.apiCall('/notifications/clear', 'DELETE');
                if (response && response.success) {
                    this.showToast('Todas as notificações foram removidas!');
                    this.data.currentUser.notifications = [];
                    this.checkAndShowNotifications();
                }
            } catch (error) {
                this.showToast('Erro ao limpar notificações', 'error');
            } finally {
                this.hideLoading();
            }
        }
    }

    getNotificationColor(type) {
        const colors = {
            'unavailability_request': 'rgba(33, 150, 243, 0.2)',
            'unavailability_request_admin': 'rgba(156, 39, 176, 0.2)',
            'unavailability_decision': 'rgba(76, 175, 80, 0.2)',
            'scale_invite': 'rgba(255, 193, 7, 0.2)',
            'default': 'rgba(158, 158, 158, 0.2)'
        };
        return colors[type] || colors.default;
    }

    getNotificationIcon(type) {
        const icons = {
            'unavailability_request': 'fas fa-user-clock',
            'unavailability_request_admin': 'fas fa-shield-alt',
            'unavailability_decision': 'fas fa-check-circle',
            'scale_invite': 'fas fa-calendar-plus',
            'default': 'fas fa-bell'
        };
        return icons[type] || icons.default;
    }

   showSettings() {
    const content = `
    <div class="content-section">
        <div class="section-header">
            <h2 class="section-title">Configurações</h2>
        </div>
        
        <div class="settings-section">
            <div class="settings-header">
                <h3 class="settings-title">Notificações</h3>
                <p class="settings-description">Gerencie suas preferências de notificação</p>
            </div>
            <div class="settings-content">
                <div class="settings-item">
                    <div class="settings-label">
                        <i class="fas fa-bell"></i>
                        Notificações Push (em desenvolvimento)
                    </div>
                    <label class="switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="settings-item">
                    <div class="settings-label">
                        <i class="fas fa-envelope"></i>
                        Notificações por Email
                    </div>
                    <label class="switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="settings-item">
                    <div class="settings-label">
                        <i class="fas fa-sms"></i>
                        Notificações por Whatsapp
                    </div>
                    <label class="switch">
                        <input type="checkbox">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="settings-section">
            <div class="settings-header">
                <h3 class="settings-title">Sobre Adorefy</h3>
                <p class="settings-description">Adorefy foi desenvolvido por Mike, aplicação de gestão de escalas ministeriaís.</p>
            </div>
            <!--<div class="settings-content">
                <div class="settings-item">
                    <div class="settings-label">
                        <i class="fas fa-moon"></i>
                        Modo Escuro
                    </div>
                    <label class="switch">
                        <input type="checkbox" checked>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="settings-item">
                    <div class="settings-label">
                        <i class="fas fa-text-height"></i>
                        Tamanho da Fonte
                    </div>
                    <select class="form-select" style="width: 150px;">
                        <option>Pequeno</option>
                        <option selected>Médio</option>
                        <option>Grande</option>
                    </select>
                </div>-->
            </div>
        </div>
        
        <button class="btn btn-primary btn-block" id="backToApp">
            <i class="fas fa-arrow-left"></i>
            Voltar para o Início
        </button>
    </div>`;

    $('#appContent').html(content);
    $('#backToApp').click(() => this.loadDashboard());
}

    showTab(tabName) {
        $('.content-section').hide();
        const targetSection = $(`#${tabName}Content`);
        if (targetSection.length > 0) {
            targetSection.show();
            switch (tabName) {
                case 'scales':
                    this.renderScales();
                    break;
                case 'members':
                    this.renderMembers();
                    break;
                case 'ministries':
                    this.renderMinistries();
                    break;
                case 'songs':
                    this.renderSongs();
                    break;
            }
        }
        $('.tab').removeClass('active');
        $(`.tab[data-tab="${tabName}"]`).addClass('active');
        this.state.currentTab = tabName;
    }

   // PRIMEIRO, CORRIGIR O MÉTODO formatDate
formatDate(dateString) {
    if (!dateString) return '';
    
    // Evitar problemas de fuso horário - usar a data exata como string
    const parts = dateString.split('-');
    if (parts.length === 3) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        return `${day}/${month}/${year}`;
    }
    
    // Fallback: usar Date se o formato não for YYYY-MM-DD
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
}
    
    formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleString('pt-BR');
    }
    
    getInitials(name) {
        if (!name) return '??';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    }
    
    getStatusText(status) {
        switch(status) {
            case 'confirmed': return 'Confirmada';
            case 'pending': return 'Pendente';
            case 'cancelled': return 'Cancelada';
            case 'unavailable': return 'Indisponível';
            case 'approved': return 'Aprovado';
            case 'rejected': return 'Rejeitado';
            default: return status;
        }
    }

    showToast(message, type = 'success') {
        const toast = $('#toast');
        toast.text(message);
        toast.removeClass('error warning');
        if (type !== 'success') toast.addClass(type);
        toast.addClass('show');
        
        setTimeout(() => {
            toast.removeClass('show');
        }, 3000);
    }

    showLoading(message = 'Carregando...') {
        this.hideLoading();
        $('body').append(`
        <div class="loading-overlay" id="globalLoading">
            <div class="loading-content">
                <div class="loading-spinner large"></div>
                <p class="loading-message">${message}</p>
            </div>
        </div>`);
    }

    hideLoading() {
        $('#globalLoading').remove();
    }


   async openScaleModal(scaleId = null) {
    this.state.currentScaleId = scaleId;
    
    try {
        const modal = $(`
        <div class="modal">
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3 class="modal-title">${scaleId ? 'Editar Escala' : 'Nova Escala'}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Evento *</label>
                            <input type="text" class="form-input scale-event" placeholder="Nome do evento">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Data *</label>
                            <input type="date" class="form-input scale-date">
                        </div>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Hora *</label>
                            <input type="time" class="form-input scale-time">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ministério *</label>
                            <div class="custom-select scale-ministry-select">
                                <div class="select-selected">Selecione um ministério</div>
                                <div class="select-items">
                                    <div class="select-search">
                                        <input type="text" placeholder="Pesquisar ministério...">
                                    </div>
                                    ${this.data.ministries.map(ministry => 
                                        `<div class="select-item" data-value="${ministry.id}">${ministry.name}</div>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Descrição</label>
                        <textarea class="form-textarea scale-description" placeholder="Descrição do evento" rows="2"></textarea>
                    </div>
                    
                    <!-- SEÇÃO DE MÚSICAS -->
                    <div class="form-group">
                        <label class="form-label">Músicas da Escala</label>
                        <div class="selected-songs" style="margin-bottom: 10px;"></div>
                        <div class="custom-select scale-songs-select">
                            <div class="select-selected">Selecione as músicas</div>
                            <div class="select-items">
                                <div class="select-search">
                                    <input type="text" placeholder="Pesquisar músicas...">
                                </div>
                                ${this.data.songs.map(song => 
                                    `<div class="select-item" data-value="${song.id}" data-youtube="${song.youtubeId || ''}">
                                        ${song.title} - ${song.artist}
                                    </div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                    
                    <!-- PLAYER DO YOUTUBE -->
                    <div class="youtube-preview" style="display: none; margin: 15px 0;">
                        <div class="youtube-header">
                            <h4>Prévia da Música</h4>
                            <button class="btn-close-preview">&times;</button>
                        </div>
                        <div id="youtubePlayer"></div>
                    </div>
                    
                    <!-- SEÇÃO DE MEMBROS COM FUNÇÕES -->
                    <div class="form-group">
                        <div class="section-header" style="margin-bottom: 15px;">
                            <label class="form-label">Membros da Escala *</label>
                            <small class="functions-hint" style="color: var(--text-tertiary); font-size: 0.85rem;">
                                As funções serão carregadas conforme o ministério selecionado
                            </small>
                        </div>
                        <div class="scale-members-list" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--border); padding: 15px; border-radius: 8px; background: var(--secondary-lighter);">
                            <div class="no-members-yet" style="text-align: center; padding: 20px; color: var(--text-tertiary);">
                                <i class="fas fa-filter" style="font-size: 1.5rem; margin-bottom: 10px;"></i>
                                <p>Selecione um ministério para ver os membros e suas funções</p>
                            </div>
                        </div>
                        
                        <!-- Contador de membros selecionados -->
                        <div class="selected-count" style="margin-top: 10px; font-size: 0.9rem; color: var(--text-tertiary); display: flex; justify-content: space-between;">
                            <span>Membros selecionados: <strong id="selectedMembersCount">0</strong></span>
                            <span>Funções atribuídas: <strong id="assignedFunctionsCount">0</strong></span>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Status</label>
                        <select class="form-select scale-status">
                            <option value="pending">Pendente</option>
                            <option value="confirmed">Confirmado</option>
                            <option value="cancelled">Cancelado</option>
                        </select>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary btn-cancel">Cancelar</button>
                        <button class="btn btn-primary btn-save">Salvar Escala</button>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');
        
        // === CARREGAR DADOS EXISTENTES SE FOR EDIÇÃO ===
        if (scaleId) {
            const scale = this.data.scales.find(s => s.id === scaleId);
            if (scale) {
                console.log('📋 Editando escala:', scale);
                
                modal.find('.scale-event').val(scale.event);
                modal.find('.scale-date').val(scale.date);
                modal.find('.scale-time').val(scale.time);
                modal.find('.scale-description').val(scale.description || '');
                modal.find('.scale-status').val(scale.status);
                
                // Ministério
                const ministry = this.data.ministries.find(m => m.id === scale.ministry);
                if (ministry) {
                    modal.find('.scale-ministry-select .select-selected')
                        .text(ministry.name)
                        .data('value', ministry.id);
                    
                    // Carregar membros COM FUNÇÕES
                    this.renderScaleMembersWithFunctions(modal, ministry.id, scale.members || []);
                }
                
                // Músicas
                if (scale.songs && Array.isArray(scale.songs)) {
                    const selectedContainer = modal.find('.selected-songs');
                    scale.songs.forEach(songId => {
                        const song = this.data.songs.find(s => s.id === songId);
                        if (song) {
                            selectedContainer.append(`
                            <div class="selected-item" data-song-id="${song.id}" data-youtube="${song.youtubeId || ''}">
                                ${song.title} - ${song.artist}
                                <span class="remove-item" data-song-id="${song.id}">×</span>
                            </div>`);
                        }
                    });
                }
            }
        } else {
            // Valores padrão para nova escala
            const today = this.getLocalDateString();
            modal.find('.scale-date').val(today);
            
            if (this.data.ministries.length > 0) {
                const firstMinistry = this.data.ministries[0];
                modal.find('.scale-ministry-select .select-selected')
                    .text(firstMinistry.name)
                    .data('value', firstMinistry.id);
                
                // Carregar membros SEM seleção inicial
                this.renderScaleMembersWithFunctions(modal, firstMinistry.id, []);
            }
        }

        // === CONFIGURAR EVENT LISTENERS ===
        this.setupScaleModalEvents(modal);
        modal.show();

        // Atualizar contadores inicialmente
        this.updateMemberCounters(modal);

    } catch (error) {
        console.error('❌ Erro ao abrir modal de escala:', error);
        this.showToast('Erro ao carregar modal', 'error');
    }
}      



// ===== ATUALIZAR CONTADORES =====
updateMemberCounters(modal) {
    const selectedCount = modal.find('.member-checkbox:checked').length;
    const assignedCount = modal.find('.member-function-select:enabled option:selected[value!=""]').length;
    
    modal.find('#selectedMembersCount').text(selectedCount);
    modal.find('#assignedFunctionsCount').text(assignedCount);
    
    // Habilitar/desabilitar botão salvar baseado em validação
    const saveBtn = modal.find('.btn-save');
    if (selectedCount > 0 && assignedCount === selectedCount) {
        saveBtn.prop('disabled', false);
        modal.find('.selected-count').css('color', 'var(--success)');
    } else {
        saveBtn.prop('disabled', true);
        modal.find('.selected-count').css('color', 'var(--warning)');
    }
}

// ===== MÉTODO PARA RENDERIZAR MEMBROS COM FUNÇÕES =====
async renderScaleMembersWithFunctions(modal, ministryId, selectedMembers = []) {
    console.log('🎯 Renderizando membros para ministério:', ministryId);
    
    const membersList = modal.find('.scale-members-list');
    if (membersList.length === 0) {
        console.error('Elemento .scale-members-list não encontrado');
        return;
    }
    
    // Mostrar loading
    membersList.html(`
        <div class="loading-members" style="text-align: center; padding: 20px;">
            <div class="loading-spinner small"></div>
            <p style="margin-top: 10px; color: var(--text-tertiary);">Carregando membros e funções...</p>
        </div>
    `);

    try {
        // 1. Buscar membros do ministério
        const ministryMembers = this.data.users.filter(user => {
            if (!user.ministries) return false;
            return user.ministries.includes(parseInt(ministryId));
        });

        console.log('👥 Membros do ministério:', ministryMembers.length);

        if (ministryMembers.length === 0) {
            membersList.html(`
                <div class="no-members-message">
                    <i class="fas fa-users-slash" style="font-size: 2rem; margin-bottom: 15px; color: var(--text-tertiary);"></i>
                    <p style="color: var(--text-secondary); margin-bottom: 10px;">Nenhum membro neste ministério</p>
                    <p style="color: var(--text-tertiary); font-size: 0.9rem; margin-bottom: 20px;">
                        Adicione membros ao ministério antes de criar escalas.
                    </p>
                    <button class="btn btn-outline btn-sm" onclick="churchTimeApp.openMemberModal()">
                        <i class="fas fa-user-plus"></i> Gerenciar Membros
                    </button>
                </div>
            `);
            return;
        }

        // 2. Buscar funções do ministério
        let ministryFunctions = [];
        try {
            const functionsResponse = await this.apiCall(`/api/ministries/${ministryId}/member-functions`);
            if (functionsResponse && functionsResponse.success) {
                ministryFunctions = functionsResponse.data.functions || [];
                console.log('🎭 Funções do ministério:', ministryFunctions.length);
            }
        } catch (functionsError) {
            console.warn('⚠️ Erro ao carregar funções:', functionsError);
        }

        // 3. Renderizar lista de membros
        let membersHtml = '';
        ministryMembers.forEach(user => {
            const isSelected = selectedMembers.some(m => m.id === user.id);
            const memberData = selectedMembers.find(m => m.id === user.id);
            
            // Determinar função selecionada
            let selectedFunctionId = '';
            let selectedFunctionName = '';
            
            if (memberData) {
                // Tentar encontrar pelo function_id primeiro
                if (memberData.function_id) {
                    const func = ministryFunctions.find(f => f.id === memberData.function_id);
                    if (func) {
                        selectedFunctionId = func.id;
                        selectedFunctionName = func.name;
                    }
                }
                // Se não encontrou pelo ID, tentar pelo nome (backward compatibility)
                else if (memberData.role) {
                    const func = ministryFunctions.find(f => f.name === memberData.role);
                    if (func) {
                        selectedFunctionId = func.id;
                        selectedFunctionName = func.name;
                    } else {
                        selectedFunctionName = memberData.role;
                    }
                }
            }

            membersHtml += `
            <div class="member-scale-item" data-user-id="${user.id}">
                <div class="member-scale-checkbox">
                    <input type="checkbox" 
                           id="scale-member-${user.id}" 
                           value="${user.id}" 
                           ${isSelected ? 'checked' : ''}
                           class="member-checkbox">
                    <label for="scale-member-${user.id}" class="member-scale-label">
                        <div class="member-scale-avatar">${this.getInitials(user.name)}</div>
                        <div class="member-scale-info">
                            <div class="member-scale-name">${user.name}</div>
                            <div class="member-scale-skills">${user.skills?.join(', ') || 'Sem habilidades'}</div>
                        </div>
                    </label>
                </div>
                
                <div class="member-scale-function ${!isSelected ? 'disabled' : ''}">
                    ${ministryFunctions.length > 0 ? `
                    <select class="form-select member-function-select" 
                            data-user-id="${user.id}"
                            ${!isSelected ? 'disabled' : ''}>
                        <option value="">Selecione uma função</option>
                        ${ministryFunctions.map(func => {
                            const isSelectedFunc = selectedFunctionId === func.id || selectedFunctionName === func.name;
                            return `
                            <option value="${func.id}" 
                                    ${isSelectedFunc ? 'selected' : ''}
                                    data-color="${func.color || '#9147ff'}"
                                    style="${func.color ? `color: ${func.color};` : ''}">
                                ${func.name}
                            </option>`;
                        }).join('')}
                    </select>
                    ` : `
                    <div class="no-functions-message">
                        <small style="color: var(--text-tertiary);">
                            <i class="fas fa-exclamation-circle"></i>
                            Nenhuma função cadastrada
                        </small>
                        <button class="btn-link" onclick="churchTimeApp.loadFunctionsManagementScreen()">
                            Cadastrar funções
                        </button>
                    </div>
                    `}
                </div>
            </div>`;
        });

        membersList.html(membersHtml);

        // 4. Configurar eventos dos checkboxes e selects
        this.setupScaleMemberEvents(modal, ministryId);

        // 5. Atualizar contadores
        this.updateMemberCounters(modal);

    } catch (error) {
        console.error('❌ Erro ao renderizar membros:', error);
        membersList.html(`
            <div class="error-message" style="text-align: center; padding: 20px; color: var(--danger);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Erro ao carregar membros</p>
                <button class="btn btn-sm btn-outline" onclick="location.reload()">Tentar novamente</button>
            </div>
        `);
    }
}

// ===== CONFIGURAR EVENTOS DOS MEMBROS NA ESCALA =====
setupScaleMemberEvents(modal, ministryId) {
    // Habilitar/desabilitar select quando checkbox mudar
    modal.off('change', '.member-checkbox').on('change', '.member-checkbox', function() {
        const isChecked = $(this).is(':checked');
        const memberItem = $(this).closest('.member-scale-item');
        const functionSelect = memberItem.find('.member-function-select');
        
        functionSelect.prop('disabled', !isChecked);
        
        if (!isChecked) {
            functionSelect.val('');
        }
        
        // Atualizar contadores
        churchTimeApp.updateMemberCounters(modal);
    });

    // Quando mudar a função, atualizar estilo
    modal.off('change', '.member-function-select').on('change', '.member-function-select', function() {
        const selectedOption = $(this).find('option:selected');
        const color = selectedOption.data('color');
        
        if (color) {
            $(this).css('border-left', `3px solid ${color}`);
        } else {
            $(this).css('border-left', '');
        }
        
        // Atualizar contadores
        churchTimeApp.updateMemberCounters(modal);
    });
}

// ADICIONE ESTE MÉTODO PARA OBTER A DATA LOCAL CORRETA
getLocalDateString() {
    const now = new Date();
    
    // Obter componentes da data LOCAL (não UTC)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
}
    renderScaleMembers(modal, ministryId, selectedMembers = []) {
        const membersList = modal.find('.scale-members-list');
        membersList.empty();

        const ministryMembers = this.data.users.filter(user => 
            user.ministries && user.ministries.includes(parseInt(ministryId))
        );

        if (ministryMembers.length === 0) {
            membersList.html('<div class="no-members-message">Nenhum membro neste ministério</div>');
            return;
        }

        ministryMembers.forEach(user => {
            const isSelected = selectedMembers.some(m => m.id === user.id);
            const memberRole = selectedMembers.find(m => m.id === user.id)?.role || '';
            
            membersList.append(`
            <div class="checkbox-item">
                <input type="checkbox" id="scale-member-${user.id}" value="${user.id}" ${isSelected ? 'checked' : ''}>
                <label for="scale-member-${user.id}">
                    ${user.name} (${user.skills?.join(', ') || 'Sem habilidades'})
                </label>
                <select class="form-select member-role" style="margin-left: 10px; width: auto;">
                    <option value="">Função</option>
                    ${this.data.roles.map(role => 
                        `<option value="${role}" ${role === memberRole ? 'selected' : ''}>${role}</option>`
                    ).join('')}
                </select>
            </div>`);
        });
    }

   // ===== SETUP DOS EVENTOS DO MODAL (mantenha seu código existente com ajustes) =====
setupScaleModalEvents(modal) {
    const self = this;
    
    // Select de ministério - ATUALIZADO
    modal.find('.scale-ministry-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.scale-ministry-select .select-items').toggle();
    });

    modal.find('.scale-ministry-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text();
        modal.find('.scale-ministry-select .select-selected').text(text).data('value', value);
        modal.find('.scale-ministry-select .select-items').hide();
        
        // Carregar membros COM FUNÇÕES deste ministério
        self.renderScaleMembersWithFunctions(modal, value, []);
        
        // Atualizar hint
        modal.find('.functions-hint').html(`
            <i class="fas fa-sync-alt fa-spin"></i>
            Carregando funções do ministério...
        `);
        
        // Depois de carregar, atualizar hint
        setTimeout(() => {
            modal.find('.functions-hint').html(`
                <i class="fas fa-check-circle" style="color: var(--success);"></i>
                Funções carregadas. Selecione membros e atribua funções.
            `);
        }, 1000);
    });

    // Select de músicas (mantenha seu código)
    modal.find('.scale-songs-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.scale-songs-select .select-items').toggle();
    });

    modal.find('.scale-songs-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text();
        const youtubeId = $(e.target).data('youtube');
        
        const selectedContainer = modal.find('.selected-songs');
        if (!selectedContainer.find(`[data-song-id="${value}"]`).length) {
            selectedContainer.append(`
            <div class="selected-item" data-song-id="${value}" data-youtube="${youtubeId}">
                ${text}
                <span class="remove-item" data-song-id="${value}">×</span>
            </div>`);
            
            if (youtubeId) {
                self.showYouTubePreview(modal, youtubeId, text);
            }
        }
        
        modal.find('.scale-songs-select .select-items').hide();
    });

    // Remover música selecionada
    modal.off('click', '.selected-songs .remove-item').on('click', '.selected-songs .remove-item', (e) => {
        e.stopPropagation();
        const songId = $(e.target).data('song-id');
        $(e.target).closest('.selected-item').remove();
        
        const hasYouTubeSongs = modal.find('.selected-item[data-youtube]').length > 0;
        if (!hasYouTubeSongs) {
            modal.find('.youtube-preview').hide();
        }
    });

    // Fechar preview do YouTube
    modal.off('click', '.btn-close-preview').on('click', '.btn-close-preview', (e) => {
        modal.find('.youtube-preview').hide();
    });

    // Pesquisa nos selects
    modal.find('.select-search input').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        const selectItems = $(this).closest('.select-items').find('.select-item');
        
        selectItems.each(function() {
            const text = $(this).text().toLowerCase();
            if (text.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    // Botão Salvar - ATUALIZADO
    modal.find('.btn-save').click(() => this.saveScaleWithFunctions(modal));
    
    // Fechar selects ao clicar fora
    $(document).click((e) => {
        if (!$(e.target).closest('.custom-select').length) {
            modal.find('.select-items').hide();
        }
    });
}

// ===== SALVAR ESCALA COM FUNÇÕES =====
async saveScaleWithFunctions(modal) {
    try {
        const event = modal.find('.scale-event').val().trim();
        const date = modal.find('.scale-date').val();
        const time = modal.find('.scale-time').val();
        const ministry = modal.find('.scale-ministry-select .select-selected').data('value');
        const description = modal.find('.scale-description').val().trim();
        const status = modal.find('.scale-status').val();

        if (!event || !date || !time || !ministry) {
            this.showToast('Preencha todos os campos obrigatórios!', 'error');
            return;
        }

        // Coletar músicas selecionadas
        const songs = [];
        modal.find('.selected-songs .selected-item').each(function() {
            const songId = parseInt($(this).data('song-id'));
            if (!isNaN(songId)) {
                songs.push(songId);
            }
        });

        // Coletar membros selecionados COM FUNÇÕES
        const members = [];
        let hasAllFunctions = true;
        
        modal.find('.member-checkbox:checked').each(function() {
            const memberId = $(this).val();
            const memberItem = $(this).closest('.member-scale-item');
            const functionSelect = memberItem.find('.member-function-select');
            const functionId = functionSelect.val();
            const functionName = functionSelect.find('option:selected').text();
            
            if (memberId && functionId && functionId !== '') {
                members.push({
                    id: parseInt(memberId),
                    function_id: parseInt(functionId),
                    role: functionName,
                    status: 'pending'
                });
            } else {
                hasAllFunctions = false;
                // Destacar membro sem função
                memberItem.addClass('missing-function');
                setTimeout(() => memberItem.removeClass('missing-function'), 1000);
            }
        });

        if (members.length === 0) {
            this.showToast('Selecione pelo menos um membro!', 'error');
            return;
        }

        if (!hasAllFunctions) {
            this.showToast('Atribua uma função para cada membro selecionado!', 'error');
            return;
        }

        const scaleData = {
            event,
            date,
            time,
            ministry: parseInt(ministry),
            description,
            status,
            songs,
            members // Agora com function_id
        };

        console.log('💾 Salvando escala com dados:', scaleData);

        this.showLoading('Salvando escala...');

        let response;
        if (this.state.currentScaleId) {
            scaleData.id = this.state.currentScaleId;
            response = await this.apiCall('/scales', 'PUT', scaleData);
        } else {
            response = await this.apiCall('/scales', 'POST', scaleData);
        }

        if (response && response.success) {
            this.showToast(this.state.currentScaleId ? 'Escala atualizada com sucesso!' : 'Escala criada com sucesso!');
            modal.remove();
            
            // Recarregar dados e atualizar interface
            await this.loadDataFromAPI();
            
            // Se estava na dashboard, recarregar
            if (this.state.currentNav === 'home') {
                this.loadDashboard();
            }
        } else {
            this.showToast(response?.error || 'Erro ao salvar escala', 'error');
        }

    } catch (error) {
        console.error('❌ Erro ao salvar escala:', error);
        this.showToast('Erro ao salvar escala: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}

showYouTubePreview(modal, youtubeInput, songTitle) {
    console.log('🎬 Debug showYouTubePreview INPUT:', {
        youtubeInput: youtubeInput,
        tipo: typeof youtubeInput,
        songTitle: songTitle
    });
    
    // Encontrar o container correto
    let previewContainer = modal.find('.youtube-preview');
    
    // Se não encontrar, procurar pelo id alternativo
    if (previewContainer.length === 0) {
        previewContainer = modal.find('#youtubePreviewSection');
    }
    
    const playerContainer = modal.find('#youtubePlayer');
    
    console.log('🎬 Debug showYouTubePreview CONTAINERS:', {
        modalEncontrado: modal.length > 0,
        previewContainerEncontrado: previewContainer.length > 0,
        playerContainerEncontrado: playerContainer.length > 0
    });
    
    // VERIFICAÇÃO CRÍTICA: youtubeInput pode ser "undefined" string
    if (!youtubeInput || youtubeInput === 'undefined' || youtubeInput.trim() === '') {
        console.log('⚠️ Input do YouTube vazio ou inválido:', youtubeInput);
        if (previewContainer.length > 0) {
            previewContainer.hide();
        }
        return;
    }
    
    // Extrair ID do YouTube do input - CORREÇÃO AQUI
    let youtubeId = this.extractYouTubeIdFromInput(youtubeInput);
    
    console.log('🔍 ID extraído:', youtubeId);
    
    if (!youtubeId) {
        console.log('❌ Não foi possível extrair ID válido');
        this.showSimpleFallback(modal, youtubeInput, songTitle);
        if (previewContainer.length > 0) {
            previewContainer.show();
        }
        return;
    }
    
    try {
        // Atualizar título se houver container de header
        const header = previewContainer.find('.youtube-header h4, .preview-header h4, h4');
        if (header.length > 0 && songTitle) {
            header.text(`Prévia: ${songTitle.substring(0, 50)}${songTitle.length > 50 ? '...' : ''}`);
        }
        
        // Limpar container anterior
        if (playerContainer.length > 0) {
            playerContainer.empty();
            
            // Criar iframe do YouTube
            const iframe = $(`
                <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; background: #000;">
                    <iframe 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;"
                        src="https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1&controls=1&enablejsapi=1&autoplay=0"
                        frameborder="0" 
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen
                        title="YouTube video player - ${songTitle || 'Prévia'}">
                    </iframe>
                </div>
                <div style="margin-top: 10px; text-align: center;">
                    <small style="color: var(--text-secondary);">
                        <i class="fab fa-youtube"></i> 
                        <a href="https://youtube.com/watch?v=${youtubeId}" target="_blank" 
                           style="color: var(--text-secondary); text-decoration: none; margin-left: 5px;">
                            Assistir no YouTube
                        </a>
                    </small>
                </div>
            `);
            
            playerContainer.html(iframe);
        } else {
            console.log('❌ Container do player não encontrado');
            // Criar container se não existir
            if (previewContainer.length > 0) {
                previewContainer.append('<div id="youtubePlayer"></div>');
                // Chamar recursivamente agora que o container existe
                setTimeout(() => this.showYouTubePreview(modal, youtubeInput, songTitle), 100);
                return;
            }
        }
        
        // Mostrar o container
        if (previewContainer.length > 0) {
            previewContainer.show();
            console.log('✅ Preview do YouTube mostrado com ID:', youtubeId);
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar preview do YouTube:', error);
        this.showSimpleFallback(modal, youtubeId, songTitle);
    }
}
extractYouTubeIdFromInput(input) {
    if (!input) return null;
    
    console.log('🔍 Extraindo ID de:', input);
    
    const trimmedInput = input.trim();
    
    // CORREÇÃO: Verificar se é "undefined" string
    if (trimmedInput === 'undefined' || trimmedInput === 'null') {
        console.log('❌ Input é string "undefined" ou "null"');
        return null;
    }
    
    // ID direto (11 caracteres padrão do YouTube)
    const idPattern = /^[a-zA-Z0-9_-]{11}$/;
    if (idPattern.test(trimmedInput)) {
        console.log('✅ Input é um ID válido');
        return trimmedInput;
    }
    
    // Padrões comuns de URLs do YouTube
    const patterns = [
        // youtu.be/ID
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        // youtube.com/embed/ID
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        // youtube.com/watch?v=ID
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        // youtube.com/v/ID
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        // youtube.com/shorts/ID
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        // m.youtube.com
        /m\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
    ];
    
    for (const pattern of patterns) {
        const match = trimmedInput.match(pattern);
        if (match && match[1]) {
            console.log('✅ ID extraído via URL:', match[1]);
            return match[1];
        }
    }
    
    // Tentar extrair ID genérico
    const genericMatch = trimmedInput.match(/(?:v=|embed\/|youtu\.be\/|\/)([a-zA-Z0-9_-]{11})/);
    if (genericMatch && genericMatch[1]) {
        console.log('✅ ID extraído via padrão genérico:', genericMatch[1]);
        return genericMatch[1];
    }
    
    console.log('❌ Nenhum ID válido encontrado');
    return null;
}
showSimpleFallback(modal, youtubeId, songTitle) {
    const previewContainer = modal.find('.youtube-preview, #youtubePreviewSection');
    const playerContainer = modal.find('#youtubePlayer');
    
    if (playerContainer.length === 0) return;
    
    playerContainer.html(`
        <div style="text-align: center; padding: 20px;">
            <div style="width: 100%; height: 180px; background: linear-gradient(135deg, var(--danger), #ff6b6b); 
                      border-radius: 8px; display: flex; align-items: center; justify-content: center; 
                      flex-direction: column; gap: 15px; margin-bottom: 15px;">
                <i class="fab fa-youtube" style="font-size: 3rem; color: white;"></i>
                <div style="color: white; font-weight: 500;">Prévia não disponível</div>
            </div>
            
            ${youtubeId ? `
            <div style="margin-bottom: 15px;">
                <a href="https://youtube.com/watch?v=${youtubeId}" target="_blank" 
                   class="btn btn-danger" style="display: inline-flex; align-items: center; gap: 8px;">
                    <i class="fab fa-youtube"></i> Assistir no YouTube
                </a>
                <div style="margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary);">
                    ID: ${youtubeId}
                </div>
            </div>
            ` : ''}
            
            ${songTitle ? `
            <div style="padding: 10px; background: var(--secondary-lighter); border-radius: 6px;">
                <div style="color: var(--text-secondary); font-size: 0.9rem;">"${songTitle}"</div>
            </div>
            ` : ''}
        </div>
    `);
    
    if (previewContainer.length > 0) {
        previewContainer.show();
    }
}

    async saveScale(modal) {
    try {
        const event = modal.find('.scale-event').val();
        const date = modal.find('.scale-date').val();
        const time = modal.find('.scale-time').val();
        const ministry = modal.find('.scale-ministry-select .select-selected').data('value');
        const description = modal.find('.scale-description').val();
        const status = modal.find('.scale-status').val();

        if (!event || !date || !time || !ministry) {
            this.showToast('Preencha todos os campos obrigatórios!', 'error');
            return;
        }

        // Coletar músicas selecionadas
        const songs = [];
        modal.find('.selected-songs .selected-item').each(function() {
            const songId = parseInt($(this).data('song-id'));
            if (!isNaN(songId)) {
                songs.push(songId);
            }
        });

        // Coletar membros selecionados
        const members = [];
        modal.find('.scale-members-list input[type="checkbox"]:checked').each(function() {
            const memberId = $(this).val();
            const role = $(this).closest('.checkbox-item').find('.member-role').val();
            if (memberId && role) {
                members.push({
                    id: parseInt(memberId),
                    role: role,
                    status: 'pending'
                });
            }
        });

        if (members.length === 0) {
            this.showToast('Selecione pelo menos um membro!', 'error');
            return;
        }

        const scaleData = {
            event,
            date,
            time,
            ministry: parseInt(ministry),
            description,
            status,
            songs, // ← Adicionar músicas
            members
        };

        this.showLoading('Salvando escala...');

        let response;
        if (this.state.currentScaleId) {
            scaleData.id = this.state.currentScaleId;
            response = await this.apiCall('/scales', 'PUT', scaleData);
        } else {
            response = await this.apiCall('/scales', 'POST', scaleData);
        }

        if (response && response.success) {
            this.showToast(this.state.currentScaleId ? 'Escala atualizada com sucesso!' : 'Escala criada com sucesso!');
            modal.remove();
            await this.loadDataFromAPI();
        } else {
            this.showToast(response?.error || 'Erro ao salvar escala', 'error');
        }

    } catch (error) {
        console.error('Erro ao salvar escala:', error);
        this.showToast('Erro ao salvar escala', 'error');
    } finally {
        this.hideLoading();
    }
}

    async openMemberModal(memberId = null) {
        this.state.currentMemberId = memberId;
        
        try {
            const modal = $(`
            <div class="modal">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 class="modal-title">${memberId ? 'Editar Membro' : 'Novo Membro'}</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label class="form-label">Nome *</label>
                            <input type="text" class="form-input member-name" placeholder="Nome completo">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email *</label>
                            <input type="email" class="form-input member-email" placeholder="email@exemplo.com">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Telefone</label>
                            <input type="tel" class="form-input member-phone" placeholder="(11) 99999-9999">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Tipo de Usuário *</label>
                            <select class="form-select member-role">
                                <option value="membro">Membro</option>
                                <option value="lider">Líder</option>
                                <option value="admin">Administrador</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Ministérios</label>
                            <div class="selected-ministries" style="margin-bottom: 10px;"></div>
                            <div class="custom-select member-ministries-select">
                                <div class="select-selected">Selecione os ministérios</div>
                                <div class="select-items">
                                    <div class="select-search">
                                        <input type="text" placeholder="Pesquisar ministérios...">
                                    </div>
                                    ${this.data.ministries.map(ministry => 
                                        `<div class="select-item" data-value="${ministry.id}">${ministry.name}</div>`
                                    ).join('')}
                                </div>
                            </div>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Habilidades</label>
                            <textarea class="form-textarea member-skills" placeholder="Violão, Vocal, Teclado..."></textarea>
                        </div>
                        <div class="modal-actions">
                            <button class="btn btn-secondary btn-cancel">Cancelar</button>
                            <button class="btn btn-primary btn-save">Salvar</button>
                        </div>
                    </div>
                </div>
            </div>`);

            modal.appendTo('body');

            if (memberId) {
                const member = this.data.users.find(u => u.id === memberId);
                if (member) {
                    modal.find('.member-name').val(member.name);
                    modal.find('.member-email').val(member.email);
                    modal.find('.member-phone').val(member.phone || '');
                    modal.find('.member-role').val(member.role);
                    modal.find('.member-skills').val(member.skills?.join(', ') || '');

                    const selectedContainer = modal.find('.selected-ministries');
                    member.ministries?.forEach(ministryId => {
                        const ministry = this.data.ministries.find(m => m.id === ministryId);
                        if (ministry) {
                            selectedContainer.append(`
                            <div class="selected-item" data-ministry-id="${ministry.id}">
                                ${ministry.name}
                                <span class="remove-item" data-ministry-id="${ministry.id}">×</span>
                            </div>`);
                        }
                    });
                }
            }

            this.setupMemberModalEvents(modal);
            modal.show();

        } catch (error) {
            this.showToast('Erro ao carregar modal', 'error');
        }
    }

    setupMemberModalEvents(modal) {
        modal.find('.member-ministries-select .select-selected').click((e) => {
            e.stopPropagation();
            $('.select-items').not(modal.find('.select-items')).hide();
            modal.find('.select-items').toggle();
        });

        modal.find('.member-ministries-select .select-item').click((e) => {
            e.stopPropagation();
            const value = $(e.target).data('value');
            const text = $(e.target).text();
            
            const selectedContainer = modal.find('.selected-ministries');
            if (!selectedContainer.find(`[data-ministry-id="${value}"]`).length) {
                selectedContainer.append(`
                <div class="selected-item" data-ministry-id="${value}">
                    ${text}
                    <span class="remove-item" data-ministry-id="${value}">×</span>
                </div>`);
            }
            
            modal.find('.select-items').hide();
        });

        modal.on('click', '.remove-item', (e) => {
            const idToRemove = $(e.target).data('ministry-id');
            $(e.target).closest('.selected-item').remove();
        });

        modal.find('.btn-save').click(() => this.saveMember(modal));
        
        $(document).click((e) => {
            if (!$(e.target).closest('.custom-select').length) {
                modal.find('.select-items').hide();
            }
        });
    }

   async saveMember(modal) {
    try {
        const name = modal.find('.member-name').val().trim();
        const email = modal.find('.member-email').val().trim().toLowerCase();
        const phone = modal.find('.member-phone').val().trim();
        const role = modal.find('.member-role').val();
        
        // Validação de skills com sanitização
        const skillsInput = modal.find('.member-skills').val().trim();
        const skills = skillsInput ? 
            skillsInput.split(',').map(s => s.trim().substring(0, 50)).filter(s => s) : [];

        // Validação de ministries
        const ministries = [];
        modal.find('.selected-item').each(function() {
            const ministryId = parseInt($(this).data('ministry-id'));
            if (!isNaN(ministryId) && ministryId > 0) {
                ministries.push(ministryId);
            }
        });

        // Validações mais robustas
        if (!name || name.length < 2 || name.length > 100) {
            this.showToast('Nome deve ter entre 2 e 100 caracteres!', 'error');
            return;
        }

        if (!email || !this.isValidEmail(email)) {
            this.showToast('Email inválido!', 'error');
            return;
        }

        if (phone && !this.isValidPhone(phone)) {
            this.showToast('Telefone inválido!', 'error');
            return;
        }

        if (!role || !['admin', 'lider', 'membro'].includes(role)) {
            this.showToast('Função inválida!', 'error');
            return;
        }

        const memberData = {
            name: this.sanitizeInput(name),
            email: email,
            phone: phone || '',
            role: role,
            skills: skills,
            ministries: ministries
        };

        this.showLoading('Salvando membro...');

        let response;
        if (this.state.currentMemberId) {
            memberData.id = parseInt(this.state.currentMemberId);
            response = await this.apiCall('/members', 'PUT', memberData);
        } else {
            // REMOVIDO: Não envia mais senha padrão
            response = await this.apiCall('/members', 'POST', memberData);
        }

        if (response && response.success) {
            this.showToast(this.state.currentMemberId ? 'Membro atualizado com sucesso!' : 'Membro criado com sucesso!');
            modal.remove();
            await this.loadDataFromAPI();
        } else {
            this.showToast(response?.error || 'Erro ao salvar membro', 'error');
        }

    } catch (error) {
        console.error('Erro ao salvar membro:', error);
        this.showToast('Erro ao salvar membro', 'error');
    } finally {
        this.hideLoading();
    }
}

// Métodos auxiliares de validação
isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

isValidPhone(phone) {
    const phoneRegex = /^[\d\s\(\)\-\+]{10,20}$/;
    return phoneRegex.test(phone);
}

sanitizeInput(input) {
    return input.replace(/[<>]/g, '');
}


    async openMinistryModal(ministryId = null) {
    this.state.currentMinistryId = ministryId;
    
    try {
        const modal = $(`
        <div class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3 class="modal-title">${ministryId ? 'Editar Ministério' : 'Novo Ministério'}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Nome *</label>
                        <input type="text" class="form-input ministry-name" placeholder="Nome do ministério">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Descrição</label>
                        <textarea class="form-textarea ministry-description" placeholder="Descrição do ministério"></textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Líder</label>
                        <div class="custom-select ministry-leader-select">
                            <div class="select-selected">Selecione um líder</div>
                            <div class="select-items">
                                <div class="select-search">
                                    <input type="text" placeholder="Pesquisar líder...">
                                </div>
                                <div class="select-item" data-value="">Nenhum líder</div>
                                ${this.data.users.map(user => 
                                    `<div class="select-item" data-value="${user.id}">${user.name} (${user.role}) - ${user.skills?.join(', ') || 'Sem habilidades'}</div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Membros</label>
                        <div class="ministry-members-container"></div>
                        <div class="custom-select ministry-members-select">
                            <div class="select-selected">Selecione os membros</div>
                            <div class="select-items">
                                <div class="select-search">
                                    <input type="text" placeholder="Pesquisar membros...">
                                </div>
                                ${this.data.users.map(user => 
                                    `<div class="select-item" data-value="${user.id}">${user.name} (${user.skills?.join(', ') || 'Sem habilidades'})</div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-secondary btn-cancel">Cancelar</button>
                        <button class="btn btn-primary btn-save">Salvar</button>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');

        if (ministryId) {
            const ministry = this.data.ministries.find(m => m.id === ministryId);
            if (ministry) {
                modal.find('.ministry-name').val(ministry.name);
                modal.find('.ministry-description').val(ministry.description || '');

                if (ministry.leader) {
                    const leader = this.data.users.find(u => u.id === ministry.leader);
                    if (leader) {
                        modal.find('.ministry-leader-select .select-selected')
                            .text(`${leader.name} (${leader.role}) - ${leader.skills?.join(', ') || ''}`)
                            .data('value', leader.id);
                    }
                }

                const membersContainer = modal.find('.ministry-members-container');
                if (ministry.members && Array.isArray(ministry.members)) {
                    ministry.members.forEach(memberId => {
                        const member = this.data.users.find(u => u.id === memberId);
                        if (member) {
                            membersContainer.append(`
                            <div class="ministry-member-item" data-member-id="${member.id}">
                                <div class="ministry-member-avatar">${this.getInitials(member.name)}</div>
                                <div class="ministry-member-info">
                                    <div class="ministry-member-name">${member.name}</div>
                                    <div class="ministry-member-role">${member.skills?.join(', ') || ''}</div>
                                </div>
                                <div class="item-action remove-member" style="color: var(--danger);">
                                    <i class="fas fa-times"></i>
                                </div>
                            </div>`);
                        }
                    });
                }
            }
        }

        this.setupMinistryModalEvents(modal);
        modal.show();

    } catch (error) {
        console.error('Erro ao abrir modal de ministério:', error);
        this.showToast('Erro ao carregar modal', 'error');
    }
}

setupMinistryModalEvents(modal) {
    // Configurar select de líderes
    modal.find('.ministry-leader-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.ministry-leader-select .select-items').toggle();
        
        // Focar no campo de pesquisa quando abrir
        setTimeout(() => {
            modal.find('.ministry-leader-select .select-search input').focus();
        }, 100);
    });

    // Configurar select de membros
    modal.find('.ministry-members-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.ministry-members-select .select-items').toggle();
        
        // Focar no campo de pesquisa quando abrir
        setTimeout(() => {
            modal.find('.ministry-members-select .select-search input').focus();
        }, 100);
    });

    // Selecionar líder
    modal.find('.ministry-leader-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text();
        modal.find('.ministry-leader-select .select-selected').text(text).data('value', value);
        modal.find('.ministry-leader-select .select-items').hide();
    });

    // Selecionar membro
    modal.find('.ministry-members-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text().split(' (')[0];
        
        const membersContainer = modal.find('.ministry-members-container');
        if (!membersContainer.find(`[data-member-id="${value}"]`).length) {
            const member = this.data.users.find(u => u.id === parseInt(value));
            if (member) {
                membersContainer.append(`
                <div class="ministry-member-item" data-member-id="${member.id}">
                    <div class="ministry-member-avatar">${this.getInitials(member.name)}</div>
                    <div class="ministry-member-info">
                        <div class="ministry-member-name">${member.name}</div>
                        <div class="ministry-member-role">${member.skills?.join(', ') || ''}</div>
                    </div>
                    <div class="item-action remove-member" style="color: var(--danger);">
                        <i class="fas fa-times"></i>
                    </div>
                </div>`);
            }
        }
        
        modal.find('.ministry-members-select .select-items').hide();
    });

    // Remover membro
    modal.on('click', '.remove-member', (e) => {
        $(e.target).closest('.ministry-member-item').remove();
    });

    // Pesquisa nos selects
    modal.find('.select-search input').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        const selectItems = $(this).closest('.select-items').find('.select-item');
        
        selectItems.each(function() {
            const text = $(this).text().toLowerCase();
            if (text.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    modal.find('.btn-save').click(() => this.saveMinistry(modal));
    
    // Fechar selects ao clicar fora
    $(document).click((e) => {
        if (!$(e.target).closest('.custom-select').length) {
            modal.find('.select-items').hide();
        }
    });
}

   setupMinistryModalEvents(modal) {
    // Configurar select de líderes
    modal.find('.ministry-leader-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.ministry-leader-select .select-items').toggle();
        
        // Focar no campo de pesquisa quando abrir
        setTimeout(() => {
            modal.find('.ministry-leader-select .select-search input').focus();
        }, 100);
    });

    // Configurar select de membros
    modal.find('.ministry-members-select .select-selected').click((e) => {
        e.stopPropagation();
        $('.select-items').not(modal.find('.select-items')).hide();
        modal.find('.ministry-members-select .select-items').toggle();
        
        // Focar no campo de pesquisa quando abrir
        setTimeout(() => {
            modal.find('.ministry-members-select .select-search input').focus();
        }, 100);
    });

    // Selecionar líder
    modal.find('.ministry-leader-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text();
        modal.find('.ministry-leader-select .select-selected').text(text).data('value', value);
        modal.find('.ministry-leader-select .select-items').hide();
    });

    // Selecionar membro
    modal.find('.ministry-members-select .select-item').click((e) => {
        e.stopPropagation();
        const value = $(e.target).data('value');
        const text = $(e.target).text().split(' (')[0];
        
        const membersContainer = modal.find('.ministry-members-container');
        if (!membersContainer.find(`[data-member-id="${value}"]`).length) {
            const member = this.data.users.find(u => u.id === parseInt(value));
            if (member) {
                membersContainer.append(`
                <div class="ministry-member-item" data-member-id="${member.id}">
                    <div class="ministry-member-avatar">${this.getInitials(member.name)}</div>
                    <div class="ministry-member-info">
                        <div class="ministry-member-name">${member.name}</div>
                        <div class="ministry-member-role">${member.skills?.join(', ') || ''}</div>
                    </div>
                    <div class="item-action remove-member" style="color: var(--danger);">
                        <i class="fas fa-times"></i>
                    </div>
                </div>`);
            }
        }
        
        modal.find('.ministry-members-select .select-items').hide();
    });

    // Remover membro
    modal.on('click', '.remove-member', (e) => {
        $(e.target).closest('.ministry-member-item').remove();
    });

    // Pesquisa nos selects
    modal.find('.select-search input').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        const selectItems = $(this).closest('.select-items').find('.select-item');
        
        selectItems.each(function() {
            const text = $(this).text().toLowerCase();
            if (text.includes(searchTerm)) {
                $(this).show();
            } else {
                $(this).hide();
            }
        });
    });

    modal.find('.btn-save').click(() => this.saveMinistry(modal));
    
    // Fechar selects ao clicar fora
    $(document).click((e) => {
        if (!$(e.target).closest('.custom-select').length) {
            modal.find('.select-items').hide();
        }
    });
}
    async saveMinistry(modal) {
        try {
            const name = modal.find('.ministry-name').val();
            const description = modal.find('.ministry-description').val();
            const leader = modal.find('.ministry-leader-select .select-selected').data('value');

            if (!name) {
                this.showToast('Nome do ministério é obrigatório!', 'error');
                return;
            }

            const members = [];
            modal.find('.ministry-member-item').each(function() {
                members.push(parseInt($(this).data('member-id')));
            });

            const ministryData = {
                name,
                description,
                leader: leader ? parseInt(leader) : null,
                members
            };

            this.showLoading('Salvando ministério...');

            let response;
            if (this.state.currentMinistryId) {
                ministryData.id = this.state.currentMinistryId;
                response = await this.apiCall('/ministries', 'PUT', ministryData);
            } else {
                response = await this.apiCall('/ministries', 'POST', ministryData);
            }

            if (response && response.success) {
                this.showToast(this.state.currentMinistryId ? 'Ministério atualizado com sucesso!' : 'Ministério criado com sucesso!');
                modal.remove();
                await this.loadDataFromAPI();
            } else {
                this.showToast(response?.error || 'Erro ao salvar ministério', 'error');
            }

        } catch (error) {
            this.showToast('Erro ao salvar ministério', 'error');
        } finally {
            this.hideLoading();
        }
    }

 
async openSongModal(songId = null) {
    // ✅ Verificar se é líder de louvor
    if (!this.isWorshipLeader()) {
        this.showToast('Apenas líderes do ministério de louvor podem gerenciar músicas.', 'error');
        return;
    }
    
    this.state.currentSongId = songId;
    
    try {
        const modal = $(`
        <div class="modal">
            <div class="modal-content" style="max-width: 900px;">
                <div class="modal-header">
                    <h3 class="modal-title">${songId ? 'Editar Música' : 'Nova Música'}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- ABA DE PESQUISA DO YOUTUBE -->
                    <div class="youtube-search-section">
                        <div class="form-group">
                            <label class="form-label">
                                <i class="fab fa-youtube" style="color: #ff0000;"></i>
                                Pesquisar no YouTube
                            </label>
                            <div class="search-container">
                                <input type="text" 
                                       class="form-input youtube-search-input" 
                                       placeholder="Digite o nome da música e artista..."
                                       id="youtubeSearchInput">
                                <button class="btn btn-primary search-btn" id="youtubeSearchBtn">
                                    <i class="fas fa-search"></i>
                                </button>
                                <button class="btn btn-outline" id="fetchLyricsBtn" style="margin-left: 10px;" title="Buscar letra e cifra automaticamente">
                                    <i class="fas fa-magic"></i> Buscar Letra & Cifra
                                </button>
                            </div>
                        </div>
                        
                        <!-- RESULTADOS DA PESQUISA -->
                        <div class="search-results" id="youtubeSearchResults" style="display: none;">
                            <div class="search-results-header">
                                <h4>Resultados da Pesquisa</h4>
                                <span class="results-count" id="resultsCount">0 resultados</span>
                            </div>
                            <div class="results-list" id="youtubeResultsList"></div>
                        </div>
                    </div>
                    
                    <div class="form-divider">
                        <span>ou preencha manualmente</span>
                    </div>
                    
                    <!-- CAMPOS MANUAIS -->
                    <div class="manual-fields">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Título *</label>
                                <input type="text" class="form-input song-title" placeholder="Título da música" id="songTitle">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Artista *</label>
                                <input type="text" class="form-input song-artist" placeholder="Artista ou banda" id="songArtist">
                            </div>
                        </div>
                        
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">ID do YouTube</label>
                                <input type="text" class="form-input song-youtube" placeholder="ID do vídeo ou URL completa" id="songYoutube">
                                <div class="field-help">
                                    <small>Cole a URL ou ID do YouTube. Ex: dQw4w9WgXcQ</small>
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Duração</label>
                                <input type="text" class="form-input song-duration" placeholder="Ex: 4:30" id="songDuration">
                            </div>
                        </div>
                        
                        <!-- NOVOS CAMPOS: LETRA E CIFRA -->
                        <div class="form-group">
                            <label class="form-label">Letra da Música</label>
                            <div style="position: relative;">
                                <textarea class="form-textarea song-lyrics" 
                                          placeholder="Cole aqui a letra da música..." 
                                          id="songLyrics" 
                                          rows="8"
                                          style="font-family: 'Courier New', monospace; white-space: pre-wrap;"></textarea>
                                <div class="char-counter" id="lyricsCounter" style="position: absolute; bottom: 5px; right: 10px; font-size: 0.8rem; color: var(--text-tertiary);">
                                    0/5000 caracteres
                                </div>
                            </div>
                            <div class="field-help">
                                <small>A letra será buscada automaticamente se você selecionar um vídeo do YouTube</small>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Cifra da Música</label>
                            <div style="position: relative;">
                                <textarea class="form-textarea song-chords" 
                                          placeholder="Cole aqui a cifra da música..." 
                                          id="songChords" 
                                          rows="6"
                                          style="font-family: 'Courier New', monospace; white-space: pre-wrap;"></textarea>
                                <div class="char-counter" id="chordsCounter" style="position: absolute; bottom: 5px; right: 10px; font-size: 0.8rem; color: var(--text-tertiary);">
                                    0/5000 caracteres
                                </div>
                            </div>
                            <div class="field-help">
                                <small>Use formatação simples: C Am F G</small>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Tags</label>
                            <input type="text" class="form-input song-tags" placeholder="adoração, exaltação, comunhão" id="songTags">
                        </div>
                    </div>
                    
                    <!-- PRÉVIA DO YOUTUBE -->
                    <div class="youtube-preview-section" id="youtubePreviewSection" style="display: none;">
                        <div class="preview-header">
                            <h4>Prévia da Música Selecionada</h4>
                            <button class="btn btn-outline btn-remove-preview" id="removePreview">
                                <i class="fas fa-times"></i> Remover
                            </button>
                        </div>
                        <div class="youtube-preview">
                            <div id="youtubePlayer"></div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary btn-cancel">Cancelar</button>
                        <button class="btn btn-primary btn-save">Salvar Música</button>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');
        
        // Configurar contadores de caracteres
        this.setupCharCounters(modal);
        
        // Carregar dados existentes se for edição
        if (songId) {
            const song = this.data.songs.find(s => s.id === songId);
            if (song) {
                modal.find('#songTitle').val(song.title);
                modal.find('#songArtist').val(song.artist);
                modal.find('#songYoutube').val(song.youtubeId || '');
                modal.find('#songDuration').val(song.duration || '');
                modal.find('#songLyrics').val(song.lyrics || '');
                modal.find('#songChords').val(song.chords || '');
                modal.find('#songTags').val(song.tags?.join(', ') || '');
                
                // Atualizar contadores
                this.updateCharCounter(modal.find('#songLyrics'), modal.find('#lyricsCounter'));
                this.updateCharCounter(modal.find('#songChords'), modal.find('#chordsCounter'));
                
                // Mostrar prévia se tiver YouTube ID
                if (song.youtubeId) {
                    this.showYouTubePreview(modal, song.youtubeId, `${song.title} - ${song.artist}`);
                    modal.find('#youtubePreviewSection').show();
                }
            }
        }

        this.setupSongModalEvents(modal);
        modal.show();

    } catch (error) {
        console.error('Erro ao abrir modal de música:', error);
        this.showToast('Erro ao carregar modal', 'error');
    }
}

// Método auxiliar para configurar contadores de caracteres
setupCharCounters(modal) {
    const lyricsTextarea = modal.find('#songLyrics');
    const chordsTextarea = modal.find('#songChords');
    const lyricsCounter = modal.find('#lyricsCounter');
    const chordsCounter = modal.find('#chordsCounter');
    
    // Atualizar contadores inicialmente
    this.updateCharCounter(lyricsTextarea, lyricsCounter);
    this.updateCharCounter(chordsTextarea, chordsCounter);
    
    // Atualizar ao digitar
    lyricsTextarea.on('input', () => this.updateCharCounter(lyricsTextarea, lyricsCounter));
    chordsTextarea.on('input', () => this.updateCharCounter(chordsTextarea, chordsCounter));
}

updateCharCounter(textarea, counterElement) {
    const length = textarea.val().length;
    const maxLength = 5000;
    
    let color = 'var(--text-tertiary)';
    if (length > maxLength * 0.9) {
        color = 'var(--warning)';
    }
    if (length > maxLength) {
        color = 'var(--danger)';
    }
    
    counterElement.text(`${length}/${maxLength} caracteres`);
    counterElement.css('color', color);
    
    // Truncar se exceder o limite
    if (length > maxLength) {
        textarea.val(textarea.val().substring(0, maxLength));
        this.updateCharCounter(textarea, counterElement);
    }
}

showAdorefyLoading(message = 'Aguarde pelo AdorefyBot') {
    // Criar o modal se não existir
    if (!document.getElementById('adorefyLoadingModal')) {
        const loadingHTML = `
            <div id="adorefyLoadingModal" class="adorefy-loading-modal">
                <div class="adorefy-loading-content">
                    <div class="adorefy-loading-spinner">
                        <div class="adorefy-spinner-circle">
                            <div class="adorefy-spinner-inner"></div>
                            <div class="adorefy-spinner-outer"></div>
                            <div class="adorefy-spinner-dots">
                                <div class="dot dot-1"></div>
                                <div class="dot dot-2"></div>
                                <div class="dot dot-3"></div>
                            </div>
                        </div>
                    </div>
                    <div class="adorefy-loading-text">
                        <h3 class="adorefy-loading-title">${message}</h3>
                        <p class="adorefy-loading-message">Processando sua requisição...</p>
                    </div>
                    <div class="adorefy-loading-bot">
                        <div class="bot-icon">
                            <svg viewBox="0 0 24 24" width="40" height="40">
                                <path fill="#8B5CF6" d="M20 9V7c0-1.1-.9-2-2-2h-3c0-1.66-1.34-3-3-3S9 3.34 9 5H6c-1.1 0-2 .9-2 2v2c-1.66 0-3 1.34-3 3s1.34 3 3 3v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c1.66 0 3-1.34 3-3s-1.34-3-3-3zm-2 10H6V7h12v12zm-9-6c0 1.66 1.34 3 3 3s3-1.34 3-3-1.34-3-3-3-3 1.34-3 3z"/>
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
            
            <style>
                .adorefy-loading-modal {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.85);
                    z-index: 9999;
                    backdrop-filter: blur(4px);
                    align-items: center;
                    justify-content: center;
                }
                
                .adorefy-loading-modal.active {
                    display: flex;
                }
                
                .adorefy-loading-content {
                    background: linear-gradient(145deg, #1e1b2e 0%, #13111d 100%);
                    border-radius: 20px;
                    padding: 40px 30px;
                    min-width: 320px;
                    max-width: 400px;
                    text-align: center;
                    border: 1px solid rgba(139, 92, 246, 0.2);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5),
                                0 0 0 1px rgba(139, 92, 246, 0.1),
                                0 0 60px rgba(139, 92, 246, 0.1);
                    animation: pulse-glow 2s infinite alternate;
                }
                
                @keyframes pulse-glow {
                    0% {
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5),
                                    0 0 0 1px rgba(139, 92, 246, 0.1),
                                    0 0 60px rgba(139, 92, 246, 0.1);
                    }
                    100% {
                        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5),
                                    0 0 0 1px rgba(139, 92, 246, 0.3),
                                    0 0 80px rgba(139, 92, 246, 0.2);
                    }
                }
                
                .adorefy-loading-spinner {
                    position: relative;
                    width: 100px;
                    height: 100px;
                    margin: 0 auto 25px;
                }
                
                .adorefy-spinner-outer {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    border: 3px solid transparent;
                    border-top: 3px solid #8B5CF6;
                    border-right: 3px solid #8B5CF6;
                    animation: spin 1.5s linear infinite;
                }
                
                .adorefy-spinner-inner {
                    position: absolute;
                    width: 80%;
                    height: 80%;
                    top: 10%;
                    left: 10%;
                    border-radius: 50%;
                    border: 3px solid transparent;
                    border-bottom: 3px solid #C4B5FD;
                    border-left: 3px solid #C4B5FD;
                    animation: spin 1s linear infinite reverse;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .adorefy-spinner-dots {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                }
                
                .adorefy-spinner-dots .dot {
                    position: absolute;
                    width: 8px;
                    height: 8px;
                    background: #A78BFA;
                    border-radius: 50%;
                    animation: bounce 2s infinite ease-in-out;
                }
                
                .dot-1 {
                    top: 10px;
                    left: 50%;
                    margin-left: -4px;
                    animation-delay: 0s;
                }
                
                .dot-2 {
                    top: 50%;
                    right: 10px;
                    margin-top: -4px;
                    animation-delay: 0.4s;
                }
                
                .dot-3 {
                    bottom: 10px;
                    left: 50%;
                    margin-left: -4px;
                    animation-delay: 0.8s;
                }
                
                @keyframes bounce {
                    0%, 100% { transform: scale(0.8); opacity: 0.7; }
                    50% { transform: scale(1.2); opacity: 1; }
                }
                
                .adorefy-loading-text {
                    margin-bottom: 25px;
                }
                
                .adorefy-loading-title {
                    color: #E9D5FF;
                    font-size: 22px;
                    margin-bottom: 10px;
                    font-weight: 600;
                    background: linear-gradient(45deg, #C4B5FD, #8B5CF6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }
                
                .adorefy-loading-message {
                    color: #A78BFA;
                    font-size: 14px;
                    opacity: 0.9;
                }
                
                .adorefy-loading-bot {
                    margin-top: 20px;
                }
                
                .bot-icon {
                    display: inline-block;
                    animation: float 3s ease-in-out infinite;
                }
                
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                }
            </style>
        `;
        
        document.body.insertAdjacentHTML('beforeend', loadingHTML);
    } else {
        // Atualizar mensagem se já existir
        const titleElement = document.querySelector('.adorefy-loading-title');
        if (titleElement) {
            titleElement.textContent = message;
        }
    }
    
    // Mostrar o modal
    const modal = document.getElementById('adorefyLoadingModal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

hideAdorefyLoading() {
    const modal = document.getElementById('adorefyLoadingModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}


// NOVO MÉTODO: Buscar letra e cifra automaticamente
async fetchLyricsAndChords(modal) {
    const title = modal.find('#songTitle').val().trim();
    const artist = modal.find('#songArtist').val().trim();
    const youtubeId = modal.find('#songYoutube').val().trim();
    
    if (!title || !artist) {
        this.showToast('Digite o título e artista primeiro', 'warning');
        return;
    }
    
    try {
        // Usar o novo loading criativo
        this.showAdorefyLoading('Buscando letra e cifra...');
        
        const response = await this.apiCall('/songs/fetch-lyrics-chords', 'POST', {
            title: title,
            artist: artist,
            youtubeId: youtubeId
        });
        
        if (response && response.success) {
            const data = response.data;
            
            // Preencher letra se encontrada
            if (data.lyrics) {
                modal.find('#songLyrics').val(data.lyrics);
                this.updateCharCounter(modal.find('#songLyrics'), modal.find('#lyricsCounter'));
                this.showToast('✅ Letra encontrada e preenchida!', 'success');
            } else {
                this.showToast('⚠️ Letra não encontrada automaticamente', 'warning');
            }
            
            // Preencher cifra se encontrada
            if (data.chords) {
                modal.find('#songChords').val(data.chords);
                this.updateCharCounter(modal.find('#songChords'), modal.find('#chordsCounter'));
                this.showToast('✅ Cifra encontrada e preenchida!', 'success');
            } else {
                this.showToast('⚠️ Cifra não encontrada automaticamente', 'warning');
            }
            
        } else {
            this.showToast(response?.error || 'Erro ao buscar letra e cifra', 'error');
        }
    } catch (error) {
        console.error('Erro ao buscar letra/cifra:', error);
        this.showToast('Erro de conexão ao buscar letra e cifra', 'error');
    } finally {
        this.hideAdorefyLoading();
    }
}

    setupSongModalEvents(modal) {
    const self = this;
    
    // Pesquisa do YouTube
    modal.find('#youtubeSearchBtn').click(() => {
        this.searchYouTube(modal);
    });
    
    // Pesquisa ao pressionar Enter
    modal.find('#youtubeSearchInput').on('keypress', (e) => {
        if (e.which === 13) {
            this.searchYouTube(modal);
        }
    });
    
      // Buscar letra e cifra automaticamente
    modal.find('#fetchLyricsBtn').click(() => {
        this.fetchLyricsAndChords(modal);
    });
    
    // Auto-pesquisa com debounce (opcional)
    let searchTimeout;
    modal.find('#youtubeSearchInput').on('input', function() {
        clearTimeout(searchTimeout);
        const query = $(this).val().trim();
        
        if (query.length > 3) {
            searchTimeout = setTimeout(() => {
                self.searchYouTube(modal);
            }, 800);
        }
    });
    
    // Remover prévia
    modal.find('#removePreview').click(() => {
        modal.find('#youtubePreviewSection').hide();
        modal.find('#songYoutube').val('');
        modal.find('#youtubePlayer').empty();
    });
    
    // Salvar música
    modal.find('.btn-save').click(() => this.saveSong(modal));
    
    // Fechar modal
    modal.find('.modal-close, .btn-cancel').click(() => {
        modal.remove();
    });
    
    // Fechar ao clicar no fundo
    //modal.on('click', (e) => {
    //    if (e.target === modal[0]) {
    //        modal.remove();
    //    }
    //});
}

async searchYouTube(modal) {
    const query = modal.find('#youtubeSearchInput').val().trim();
    
    if (!query) {
        this.showToast('Digite algo para pesquisar', 'warning');
        return;
    }
    
    const resultsContainer = modal.find('#youtubeSearchResults');
    const resultsList = modal.find('#youtubeResultsList');
    const resultsCount = modal.find('#resultsCount');
    
    // CORREÇÃO: Capturar o contexto correto
    const self = this;
    
    try {
        // Mostrar loading
        resultsList.html(`
            <div class="search-loading">
                <div class="loading-spinner"></div>
                <p>Pesquisando no YouTube...</p>
            </div>
        `);
        resultsContainer.show();
        
        console.log('🔍 Iniciando pesquisa por:', query);
        
        // Usar apiCall corrigido
        const response = await this.apiCall('/youtube/search', 'POST', {
            query: query,
            maxResults: 10
        });
        
        console.log('✅ Resposta recebida:', response);
        
        if (response && response.success && response.data.videos) {
            const videos = response.data.videos;
            
            if (videos.length === 0) {
                resultsList.html(`
                    <div class="no-results">
                        <i class="fas fa-search"></i>
                        <h4>Nenhum resultado encontrado</h4>
                        <p>Tente usar palavras-chave diferentes</p>
                    </div>
                `);
                resultsCount.text('0 resultados');
                return;
            }
            
            resultsCount.text(`${videos.length} resultado(s)`);
            
            let resultsHtml = '';
            videos.forEach(video => {
                const duration = video.duration ? this.formatVideoDuration(video.duration) : '';
                const publishedDate = video.publishedAt ? 
                    new Date(video.publishedAt).toLocaleDateString('pt-BR') : '';
                
                resultsHtml += `
<div class="youtube-result-item" 
     data-video-id="${video.id}" 
     data-title="${this.escapeHtml(video.title)}" 
     data-channel="${this.escapeHtml(video.channelTitle)}"
     data-duration="${duration}">
    <div class="result-thumbnail">
        <img src="${video.thumbnail}" alt="Thumbnail" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='block' ">
        <div class="thumbnail-placeholder" style="display: none;">
            <i class="fas fa-music"></i>
        </div>
    </div>
    <div class="result-info">
        <div class="result-title" title="${this.escapeHtml(video.title)}">${this.escapeHtml(video.title)}</div>
        <div class="result-channel" title="${this.escapeHtml(video.channelTitle)}">${this.escapeHtml(video.channelTitle)}</div>
        <div class="result-meta">
            ${duration ? `<span class="result-duration"><i class="fas fa-clock"></i> ${duration}</span>` : ''}
            ${publishedDate ? `<span class="result-published"><i class="fas fa-calendar"></i> ${publishedDate}</span>` : ''}
        </div>
    </div>
    <div class="result-action">
        <button class="btn btn-primary btn-sm btn-select-video">
            <i class="fas fa-check"></i> Selecionar
        </button>
    </div>
</div>`;
            });
            
            resultsList.html(resultsHtml);
            
            // CORREÇÃO: Usar arrow functions para manter o contexto
            modal.off('click', '.btn-select-video').on('click', '.btn-select-video', (e) => {
                e.stopPropagation();
                const resultItem = $(e.currentTarget).closest('.youtube-result-item');
                this.selectYouTubeVideo(modal, resultItem);
            });
            
            modal.off('click', '.youtube-result-item').on('click', '.youtube-result-item', (e) => {
                if (!$(e.target).closest('.btn-select-video').length) {
                    this.selectYouTubeVideo(modal, $(e.currentTarget));
                }
            });
            
        } else {
            throw new Error(response?.error || 'Erro na pesquisa');
        }
        
    } catch (error) {
        console.error('❌ Erro na pesquisa do YouTube:', error);
        
        let errorMessage = error.message;
        if (error.message.includes('404')) {
            errorMessage = 'Rota /youtube/search não encontrada no servidor.';
        }
        
        resultsList.html(`
            <div class="no-results">
                <i class="fas fa-exclamation-triangle"></i>
                <h4>Erro na pesquisa</h4>
                <p>${errorMessage}</p>
            </div>
        `);
        resultsCount.text('Erro');
    }
}

selectYouTubeVideo(modal, resultItem) {
    const videoId = resultItem.data('video-id');
    const title = resultItem.data('title');
    const channel = resultItem.data('channel');
    const duration = resultItem.data('duration');
    
    console.log('🎵 Selecionando vídeo:', { videoId, title, channel, duration });
    
    // Preencher campos automaticamente
    modal.find('#songTitle').val(title);
    modal.find('#songArtist').val(channel);
    modal.find('#songYoutube').val(videoId);
    modal.find('#songDuration').val(duration);
    
    // Extrair tags do título
    const tags = this.extractTagsFromTitle(title);
    if (tags.length > 0) {
        modal.find('#songTags').val(tags.join(', '));
    }
    
    // Mostrar prévia
    this.showYouTubePreview(modal, videoId, `${title} - ${channel}`);
    modal.find('#youtubePreviewSection').show();
    
    // Fechar resultados
    modal.find('#youtubeSearchResults').hide();
    
    // Buscar letra e cifra automaticamente
    setTimeout(() => {
        this.fetchLyricsAndChords(modal);
    }, 500);
    
    this.showToast('Vídeo do YouTube selecionado! Buscando letra e cifra...', 'success');
}
// Métodos auxiliares
formatVideoDuration(duration) {
    if (!duration) return '';
    
    // Converte formato ISO 8601 (PT1H5M30S) para MM:SS
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return duration;
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

extractTagsFromTitle(title) {
    if (!title) return [];
    
    const commonWords = ['official', 'video', 'lyrics', 'hd', '4k', 'full', 'version', 'music', 'vevo'];
    const tags = [];
    
    // Remove caracteres especiais e divide em palavras
    const words = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !commonWords.includes(word));
    
    // Adiciona as primeiras 3 palavras significativas como tags
    return words.slice(0, 3);
}

escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

  async saveSong(modal) {
    try {
        const title = modal.find('.song-title').val().trim();
        const artist = modal.find('.song-artist').val().trim();
        const youtubeId = modal.find('.song-youtube').val().trim();
        const duration = modal.find('.song-duration').val().trim();
        const lyrics = modal.find('.song-lyrics').val().trim();
        const chords = modal.find('.song-chords').val().trim();
        const tags = modal.find('.song-tags').val().split(',').map(t => t.trim()).filter(t => t);

        if (!title || !artist) {
            this.showToast('Título e artista são obrigatórios!', 'error');
            return;
        }

        const songData = {
            title,
            artist,
            youtubeId: youtubeId || null,
            duration: duration || null,
            lyrics: lyrics || null,
            chords: chords || null,
            tags
        };

        this.showLoading('Salvando música...');

        let response;
        if (this.state.currentSongId) {
            songData.id = this.state.currentSongId;
            response = await this.apiCall('/songs', 'PUT', songData);
        } else {
            response = await this.apiCall('/songs', 'POST', songData);
        }

        if (response && response.success) {
            let message = this.state.currentSongId ? 
                'Música atualizada com sucesso!' : 
                'Música criada com sucesso!';
            
            if (response.auto_fetched) {
                if (response.auto_fetched.lyrics || response.auto_fetched.chords) {
                    let autoMsg = '';
                    if (response.auto_fetched.lyrics) autoMsg += 'Letra ';
                    if (response.auto_fetched.chords) autoMsg += 'Cifra ';
                    message += ` (${autoMsg}encontrada automaticamente)`;
                }
            }
            
            this.showToast(message);
            modal.remove();
            
            // Carrega a tela de gerenciamento de músicas
            await this.loadMusicManagementScreen();
        } else {
            this.showToast(response?.error || 'Erro ao salvar música', 'error');
        }

    } catch (error) {
        console.error('Erro ao salvar música:', error);
        this.showToast('Erro ao salvar música: ' + error.message, 'error');
    } finally {
        this.hideLoading();
    }
}
     async requestUnavailability(date, reason) {
        try {
            this.showLoading('Enviando solicitação...');

            const response = await this.apiCall('/members/unavailability', 'POST', {
                start: date,
                end: date,
                reason: reason
            });

            if (response && response.success) {
                this.showToast('Solicitação enviada com sucesso!');
                if (response.data && response.data.unavailability) {
                    if (!this.data.currentUser.unavailability) {
                        this.data.currentUser.unavailability = [];
                    }
                    this.data.currentUser.unavailability.push(response.data.unavailability);
                    localStorage.setItem('churchTimeUser', JSON.stringify(this.data.currentUser));
                }
                this.forceCalendarUpdate();
            } else {
                this.showToast(response?.error || 'Erro ao enviar solicitação', 'error');
            }

        } catch (error) {
            this.showToast('Erro de conexão com o servidor', 'error');
        } finally {
            this.hideLoading();
        }
    }

    forceCalendarUpdate() {
        this.updateUserUnavailability();
        setTimeout(() => {
            if (this.state.currentNav === 'calendar') {
                this.updateCalendar();
            }
        }, 300);
    }

    async updateUserUnavailability() {
        if (!this.data.currentUser) return;

        try {
            const response = await this.apiCall('/user/unavailability');
            if (response && response.success) {
                this.data.currentUser.unavailability = response.data.unavailability || [];
                localStorage.setItem('churchTimeUser', JSON.stringify(this.data.currentUser));
                
                if (this.state.currentNav === 'calendar') {
                    setTimeout(() => {
                        this.updateCalendar();
                    }, 300);
                }
            }
        } catch (error) {
            console.error('Erro ao buscar indisponibilidades:', error);
        }
    }

    //dal para solicitar indisponibilidade
showUnavailabilityModal(date) {
    // Remover qualquer modal existente
    $('.modal').remove();
    
    this.state.selectedDate = date;

    const modal = $(`
    <div class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h3 class="modal-title">Solicitar Indisponibilidade</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">Data</label>
                    <input type="date" class="form-input unavailability-date" value="${date}" readonly>
                </div>
                <div class="form-group">
                    <label class="form-label">Motivo *</label>
                    <textarea class="form-textarea unavailability-reason" placeholder="Descreva o motivo da sua indisponibilidade..." rows="4"></textarea>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary btn-close-modal">Cancelar</button>
                    <button class="btn btn-primary btn-save-request">Enviar</button>
                </div>
            </div>
        </div>
    </div>`);

    modal.appendTo('body');

    // Event listeners
    modal.find('.btn-save-request').on('click', () => {
        const reason = modal.find('.unavailability-reason').val();
        if (!reason || reason.trim() === '') {
            this.showToast('Por favor, informe o motivo!', 'error');
            return;
        }
        this.requestUnavailability(date, reason.trim());
        modal.remove();
    });

    modal.find('.modal-close, .btn-close-modal').on('click', () => {
        modal.remove();
    });
    
    // Event listener para fechar modal ao clicar no fundo
   // modal.on('click', (e) => {
   //     if (e.target === modal[0]) {
   //         modal.remove();
   //     }
   // });

    modal.show();
}

loadFunctionsManagementScreen() {
    if (!this.isLeader()) {
        this.showToast('Acesso negado', 'error');
        return this.loadDashboard();
    }

    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Gerenciar Funções do Ministério</h2>
            <div class="header-actions">
                <span class="view-all" id="refreshFunctions">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </span>
                <span class="view-all" id="addFunctionBtn" style="margin-left: 10px;">
                    <i class="fas fa-plus"></i> Nova Função
                </span>
            </div>
        </div>
        
        <div class="card">
            <div class="management-filters">
                <div class="filter-group">
                    <label>Selecione o Ministério:</label>
                    <select class="form-select" id="ministryFunctionsFilter">
                        <option value="">Selecione um ministério</option>
                        ${this.data.ministries.filter(m => 
                            this.isLeaderOfMinistry(m.id) || this.hasPermission('ministerios_gerenciar_all')
                        ).map(m => 
                            `<option value="${m.id}">${m.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="filter-group" style="max-width: 200px;">
                    <label>Pesquisar:</label>
                    <input type="text" class="form-input" id="functionSearch" placeholder="Buscar função...">
                </div>
            </div>
            
            <div id="functionsManagementList">
                <div style="text-align: center; padding: 20px;">
                    <i class="fas fa-filter" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
                    <p style="color: var(--text-tertiary);">Selecione um ministério para gerenciar suas funções</p>
                </div>
            </div>
        </div>
    </div>`;

    $('#appContent').html(content);
    
    // Event listeners
    $('#ministryFunctionsFilter').change(() => this.loadFunctionsForMinistry());
    $('#functionSearch').on('input', () => this.filterFunctionList());
    $('#addFunctionBtn').click(() => this.openFunctionModal());
    $('#refreshFunctions').click(() => {
        const ministryId = $('#ministryFunctionsFilter').val();
        if (ministryId) {
            this.loadFunctionsForMinistry();
        }
    });
}

async loadFunctionsForMinistry() {
    const ministryId = $('#ministryFunctionsFilter').val();
    
    if (!ministryId) {
        $('#functionsManagementList').html(`
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-filter" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 10px;"></i>
                <p style="color: var(--text-tertiary);">Selecione um ministério para gerenciar suas funções</p>
            </div>
        `);
        return;
    }

    try {
        this.showLoading('Carregando funções...');
        
        const response = await this.apiCall(`/api/ministries/${ministryId}/member-functions`);
        
        if (response && response.success) {
            this.data.functions = response.data.functions || [];
            this.renderFunctionsManagement(this.data.functions);
        } else {
            this.showToast('Erro ao carregar funções', 'error');
            $('#functionsManagementList').html(`
                <div style="text-align: center; padding: 20px; color: var(--danger);">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar funções</p>
                </div>
            `);
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}


    setContent(html) {
        const contentElement = document.getElementById('main-content') || 
                              document.getElementById('content') || 
                              document.getElementById('app-content') ||
                              document.querySelector('.content') ||
                              document.querySelector('.main-content');
        
        if (contentElement) {
            contentElement.innerHTML = html;
        } else {
            // Se não encontrar, cria um elemento
            const appDiv = document.getElementById('app') || 
                          document.getElementById('root') || 
                          document.body;
            
            let contentDiv = document.getElementById('content-area');
            if (!contentDiv) {
                contentDiv = document.createElement('div');
                contentDiv.id = 'content-area';
                appDiv.appendChild(contentDiv);
            }
            contentDiv.innerHTML = html;
        }
    }
    
renderFunctionsManagement(functions) {
    const container = $('#functionsManagementList');
    
    if (!functions || functions.length === 0) {
        const ministryId = $('#ministryFunctionsFilter').val();
        const ministry = this.data.ministries.find(m => m.id == ministryId);
        const ministryName = ministry ? ministry.name : 'este ministério';
        
        container.html(`
        <div style="text-align: center; padding: 40px 20px;">
            <i class="fas fa-user-tag" style="font-size: 3rem; margin-bottom: 15px; color: var(--text-secondary);"></i>
            <h3 style="color: var(--text-secondary); margin-bottom: 10px;">Nenhuma função cadastrada</h3>
            <p style="color: var(--text-tertiary); font-size: 0.9rem; margin-bottom: 20px;">
                ${ministryName} ainda não tem funções definidas. Adicione funções específicas para o ministério.
            </p>
            <div class="action-buttons" style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                <button class="btn btn-primary" id="createFirstFunction">
                    <i class="fas fa-plus"></i> <span class="btn-text">Criar Primeira Função</span>
                </button>
                <button class="btn btn-outline" id="useDefaultFunctions">
                    <i class="fas fa-magic"></i> <span class="btn-text">Carregar Funções Padrão</span>
                </button>
            </div>
        </div>`);
        
        $('#createFirstFunction').click(() => this.openFunctionModal());
        $('#useDefaultFunctions').click(() => this.loadDefaultFunctions());
        return;
    }

    let html = '';
    functions.forEach(func => {
        html += `
        <div class="management-function-item" data-function-id="${func.id}">
            <div class="function-info">
                <div class="function-color" style="background-color: ${func.color || '#9147ff'}">
                    <i class="fas fa-user-tag"></i>
                </div>
                <div class="function-details">
                    <div class="function-name" title="${func.name}">${func.name}</div>
                    ${func.description ? `<div class="function-description" title="${func.description}">${func.description}</div>` : ''}
                    <div class="function-meta">
                        <span class="function-order"><i class="fas fa-sort-numeric-down"></i> Ordem: ${func.order || 0}</span>
                        <span class="function-date"><i class="fas fa-calendar"></i> Criada: ${this.formatDate(func.created_at)}</span>
                    </div>
                </div>
            </div>
            <div class="function-actions">
                <button class="btn btn-outline btn-edit-function" data-function-id="${func.id}" title="Editar">
                    <i class="fas fa-edit"></i> <span class="btn-text">Editar</span>
                </button>
                <button class="btn btn-danger btn-delete-function" data-function-id="${func.id}" title="Excluir">
                    <i class="fas fa-trash"></i> <span class="btn-text">Excluir</span>
                </button>
            </div>
        </div>`;
    });

    container.html(html);
    this.setupFunctionsManagementEvents();
}

setupFunctionsManagementEvents() {
    // Editar função
    $(document).off('click', '.btn-edit-function').on('click', '.btn-edit-function', (e) => {
        const functionId = $(e.currentTarget).data('function-id');
        this.openFunctionModal(functionId);
    });

    // Excluir função
    $(document).off('click', '.btn-delete-function').on('click', '.btn-delete-function', (e) => {
        const functionId = $(e.currentTarget).data('function-id');
        this.deleteFunction(functionId);
    });
}

filterFunctionList() {
    const searchTerm = $('#functionSearch').val().toLowerCase();
    const functionItems = $('.management-function-item');
    
    functionItems.each(function() {
        const name = $(this).find('.function-name').text().toLowerCase();
        const description = $(this).find('.function-description').text().toLowerCase();
        
        if (name.includes(searchTerm) || description.includes(searchTerm)) {
            $(this).show();
        } else {
            $(this).hide();
        }
    });
}

async openFunctionModal(functionId = null) {
    const ministryId = $('#ministryFunctionsFilter').val();
    
    if (!ministryId && !functionId) {
        this.showToast('Selecione um ministério primeiro', 'error');
        return;
    }

    try {
        let functionData = null;
        let isEdit = false;
        
        if (functionId) {
            // Buscar dados da função existente
            isEdit = true;
            const response = await this.apiCall(`/api/member-functions/${functionId}`);
            if (response && response.success) {
                functionData = response.data.function;
            }
        }
        
        // Buscar lista de cores padrão
        const colors = [
            '#9147ff', '#7B68EE', '#6A5ACD', '#483D8B', '#FF6B6B', '#FF8E6B',
            '#FFD166', '#06D6A0', '#4ECDC4', '#118AB2', '#073B4C', '#7209B7',
            '#F72585', '#4361EE', '#3A0CA3', '#4CC9F0'
        ];
        
        // Se for edição, usar ministério da função
        const targetMinistryId = functionData ? functionData.ministry_id : ministryId;
        const ministry = this.data.ministries.find(m => m.id == targetMinistryId);
        const ministryName = ministry ? ministry.name : '';
        
        const modal = $(`
        <div class="modal">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title">${isEdit ? 'Editar Função' : 'Nova Função'}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">Ministério</label>
                        <div class="form-input" style="background: var(--secondary-lighter); padding: 15px; border-radius: 8px; border: 2px solid var(--border);">
                            <strong>${ministryName}</strong>
                            <input type="hidden" id="functionMinistryId" value="${targetMinistryId}">
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Nome da Função *</label>
                        <input type="text" class="form-input" id="functionName" 
                               placeholder="Ex: Vocal, Violão, Baixo..." 
                               value="${functionData ? functionData.name : ''}" 
                               maxlength="100">
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Descrição</label>
                        <textarea class="form-textarea" id="functionDescription" 
                                  placeholder="Descreva a função (opcional)" 
                                  rows="3">${functionData ? functionData.description || '' : ''}</textarea>
                    </div>
                    
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">Cor da Função</label>
                            <div class="color-picker">
                                <div class="color-options">
                                    ${colors.map(color => `
                                        <div class="color-option ${functionData && functionData.color === color ? 'selected' : ''}" 
                                             style="background-color: ${color}"
                                             data-color="${color}">
                                            ${functionData && functionData.color === color ? '<i class="fas fa-check"></i>' : ''}
                                        </div>
                                    `).join('')}
                                </div>
                                <input type="text" class="form-input" id="functionColor" 
                                       value="${functionData ? functionData.color : '#9147ff'}" 
                                       placeholder="#9147ff" style="margin-top: 10px;">
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Ordem de Exibição</label>
                            <input type="number" class="form-input" id="functionOrder" 
                                   value="${functionData ? functionData.order : 0}" 
                                   min="0" max="100">
                            <div class="field-help">
                                <small>Número para ordenar as funções na lista (menor = primeiro)</small>
                            </div>
                        </div>
                    </div>
                    
                    <div class="modal-actions">
                        <button class="btn btn-secondary btn-cancel">Cancelar</button>
                        <button class="btn btn-primary btn-save-function">
                            ${isEdit ? 'Salvar Alterações' : 'Criar Função'}
                        </button>
                    </div>
                </div>
            </div>
        </div>`);

        modal.appendTo('body');
        
        // Configurar color picker
        modal.find('.color-option').click(function() {
            const color = $(this).data('color');
            modal.find('.color-option').removeClass('selected').html('');
            $(this).addClass('selected').html('<i class="fas fa-check"></i>');
            modal.find('#functionColor').val(color);
        });
        
        // Atualizar cor ao digitar
        modal.find('#functionColor').on('input', function() {
            const color = $(this).val();
            const colorOption = modal.find(`.color-option[data-color="${color}"]`);
            if (colorOption.length) {
                modal.find('.color-option').removeClass('selected').html('');
                colorOption.addClass('selected').html('<i class="fas fa-check"></i>');
            }
        });
        
        // Salvar função
        modal.find('.btn-save-function').click(() => this.saveFunction(modal, functionId));
        
        // Fechar modal
        modal.find('.modal-close, .btn-cancel').click(() => {
            modal.remove();
        });
        
        // Fechar ao clicar no fundo
        //modal.on('click', (e) => {
       //     if (e.target === modal[0]) {
       //         modal.remove();
       //     }
       // });
        
    } catch (error) {
        console.error('Erro ao abrir modal de função:', error);
        this.showToast('Erro ao carregar dados', 'error');
    }
}

async saveFunction(modal, functionId) {
    const name = modal.find('#functionName').val().trim();
    const description = modal.find('#functionDescription').val().trim();
    const color = modal.find('#functionColor').val().trim();
    const order = parseInt(modal.find('#functionOrder').val()) || 0;
    const ministryId = modal.find('#functionMinistryId').val();
    
    if (!name) {
        this.showToast('O nome da função é obrigatório!', 'error');
        return;
    }
    
    if (!/^#[0-9A-F]{6}$/i.test(color) && !/^#[0-9A-F]{3}$/i.test(color)) {
        this.showToast('Cor inválida! Use formato hexadecimal (#FFF ou #FFFFFF)', 'error');
        return;
    }
    
    const functionData = {
        name: name,
        description: description,
        color: color,
        order: order,
        ministry_id: parseInt(ministryId)
    };
    
    try {
        this.showLoading('Salvando função...');
        
        let response;
        if (functionId) {
            response = await this.apiCall(`/api/member-functions/${functionId}`, 'PUT', functionData);
        } else {
            response = await this.apiCall('/api/member-functions', 'POST', functionData);
        }
        
        if (response && response.success) {
            this.showToast(functionId ? 'Função atualizada com sucesso!' : 'Função criada com sucesso!');
            modal.remove();
            await this.loadFunctionsForMinistry();
        } else {
            this.showToast(response?.error || 'Erro ao salvar função', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

async deleteFunction(functionId) {
    if (!confirm('Tem certeza que deseja excluir esta função?\n\nEsta ação não pode ser desfeita.')) {
        return;
    }

    try {
        this.showLoading('Excluindo função...');
        
        const response = await this.apiCall(`/api/member-functions/${functionId}`, 'DELETE');
        
        if (response && response.success) {
            this.showToast('Função excluída com sucesso!');
            this.loadFunctionsForMinistry(); // Recarregar a lista
        } else {
            this.showToast(response?.error || 'Erro ao excluir função', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

async loadDefaultFunctions() {
    const ministryId = $('#ministryFunctionsFilter').val();
    
    if (!ministryId) {
        this.showToast('Selecione um ministério primeiro', 'error');
        return;
    }

    if (!confirm('Deseja carregar as funções padrão para este ministério?\n\nEsta ação adicionará várias funções comuns de louvor.')) {
        return;
    }

    try {
        this.showLoading('Carregando funções padrão...');
        
        // Buscar funções padrão da API
        const response = await this.apiCall('/api/member-functions/defaults');
        
        if (response && response.success) {
            const defaultFunctions = response.data.default_functions;
            
            // Criar cada função padrão
            let createdCount = 0;
            let errorCount = 0;
            
            for (const func of defaultFunctions) {
                try {
                    const createData = {
                        ...func,
                        ministry_id: parseInt(ministryId),
                        order: createdCount // Usar ordem sequencial
                    };
                    
                    await this.apiCall('/api/member-functions', 'POST', createData);
                    createdCount++;
                    
                    // Pequeno delay para evitar sobrecarga
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    console.error('Erro ao criar função:', func.name, error);
                    errorCount++;
                }
            }
            
            this.showToast(`${createdCount} funções criadas com sucesso!${errorCount > 0 ? ` (${errorCount} erros)` : ''}`);
            this.loadFunctionsForMinistry();
            
        } else {
            this.showToast('Erro ao carregar funções padrão', 'error');
        }
    } catch (error) {
        this.showToast('Erro de conexão', 'error');
    } finally {
        this.hideLoading();
    }
}

 // Método para limpar todos os modais e estados
clearModals() {
    $('.modal').remove();
    $('.calendar-day').removeClass('selected');
    $('#requestUnavailabilityBtn').hide();
    this.state.selectedDate = null;
}
    setupCalendarEventListeners() {
    const floatingBtn = $('#requestUnavailabilityBtn');
    let selectedDate = null;
    
    // 🔥 REMOVER TODOS OS LISTENERS ANTIGOS DO CALENDÁRIO
    $(document).off('click', '#calendarDays .calendar-day.current-month');
    $(document).off('click', '#requestUnavailabilityBtn');
    $(document).off('click', '.calendar-day.current-month'); // Geral também
    
    // 🎯 LISTENER ESPECÍFICO APENAS para calendário principal (indisponibilidade)
    $(document).on('click', '#calendarDays .calendar-day.current-month', function(e) {
        // Verificar se não é parte de um wizard (tem classe específica)
        if ($(this).closest('.wizard-calendar-container').length) {
            console.log('⚠️ Ignorando clique - está no wizard');
            return; // Está no wizard, não faz nada
        }
        
        const date = $(this).data('date');
        const isPast = $(this).hasClass('past');
        
        if (isPast) {
            churchTimeApp.showToast('Não é possível selecionar datas passadas', 'warning');
            return;
        }
        
        console.log('📅 Calendário principal clicado:', date);
        
        // Remover seleção anterior
        $('#calendarDays .calendar-day').removeClass('selected');
        $(this).addClass('selected');
        
        selectedDate = date;
        floatingBtn.show();
        
        // NÃO abrir modal automaticamente - apenas mostra o botão flutuante
    });
    
    // Botão flutuante - ABRIR MODAL DE INDISPONIBILIDADE
    floatingBtn.off('click').on('click', function() {
        if (selectedDate) {
            console.log('📋 Abrindo modal de indisponibilidade para:', selectedDate);
            churchTimeApp.showUnavailabilityModal(selectedDate);
            floatingBtn.hide();
            $('#calendarDays .calendar-day').removeClass('selected');
            selectedDate = null;
        }
    });
    
    // Esconder botão ao clicar fora
    $(document).on('click', function(e) {
        if (!$(e.target).closest('#calendarDays .calendar-day').length && 
            !$(e.target).closest('.floating-action-btn').length &&
            !$(e.target).closest('.modal').length) {
            floatingBtn.hide();
            $('#calendarDays .calendar-day').removeClass('selected');
            selectedDate = null;
        }
    });
    
    // Remover seleção ao mudar de mês
    $('#prevMonth, #nextMonth').off('click').on('click', function() {
        floatingBtn.hide();
        $('#calendarDays .calendar-day').removeClass('selected');
        selectedDate = null;
    });
}
    startRealTimeUpdates() {
        setInterval(() => {
            if (this.data.currentUser && (this.data.currentUser.role === 'admin' || this.data.currentUser.role === 'lider')) {
                this.loadPendingRequestsFromAPI();
            }
            this.checkAndShowNotifications();
        }, 30000);

        setInterval(() => {
            this.updatePendingRequestsBadgeCount();
        }, 60000);
    }

    async updatePendingRequestsBadgeCount() {
        if (!this.data.currentUser || (this.data.currentUser.role !== 'admin' && this.data.currentUser.role !== 'lider')) {
            return;
        }

        try {
            const response = await this.apiCall('/unavailability/pending');
            if (response && response.success) {
                let requestsData = [];
                if (response.data && response.data.pending_requests) {
                    requestsData = response.data.pending_requests;
                }
                const pendingCount = Array.isArray(requestsData) ? requestsData.length : 0;
                this.updatePendingRequestsBadge(pendingCount);
            }
        } catch (error) {
            console.error('Erro ao atualizar badge:', error);
        }
    }

  updatePendingRequestsBadge(pendingRequests) {
    if (!this.isLeader()) return;
    
    if (!pendingRequests || !Array.isArray(pendingRequests)) {
        $('#pendingRequestsBtn').find('.notification-badge').remove();
        return;
    }

    const pendingCount = pendingRequests.length;
    const pendingBtn = $('#pendingRequestsBtn');
    let badge = pendingBtn.find('.notification-badge');
    
    // Remover badge se não há solicitações
    if (pendingCount === 0) {
        badge.remove();
        pendingBtn.removeClass('has-notifications');
        return;
    }
    
    // Atualizar ou criar badge
    if (badge.length === 0) {
        badge = $('<span class="notification-badge pending-badge"></span>');
        pendingBtn.append(badge);
    }
    
    badge.text(pendingCount > 99 ? '99+' : pendingCount);
    pendingBtn.addClass('has-notifications');
    
    // Adicionar animação para novas solicitações
    if (pendingCount > 0) {
        badge.addClass('pulse');
        setTimeout(() => badge.removeClass('pulse'), 2000);
    }
    
    // Atualizar também no header management se existir
    const headerBadge = $('#pendingRequestsBadge');
    if (headerBadge.length > 0) {
        if (pendingCount === 0) {
            headerBadge.hide();
        } else {
            headerBadge.text(pendingCount).show();
        }
    }
}

startNotificationPolling() {
    console.log('🔔 Iniciando polling de notificações...');
    
    // Parar polling anterior se existir
    if (this.notificationInterval) {
        clearInterval(this.notificationInterval);
    }
    
    // Verificar notificações a cada 30 segundos
    this.notificationInterval = setInterval(() => {
        if (this.data.currentUser && $('#appScreen').is(':visible')) {
            this.checkAndShowNotifications();
        }
    }, 30000); // 30 segundos
    
    // Verificação mais frequente para líderes (15 segundos)
    if (this.isLeader()) {
        this.leaderInterval = setInterval(() => {
            if (this.data.currentUser && $('#appScreen').is(':visible')) {
                this.checkPendingRequests();
            }
        }, 15000); // 15 segundos
    }
    
    // Também verificar quando o usuário volta para a aba
    $(document).on('visibilitychange', () => {
        if (!document.hidden && this.data.currentUser) {
            this.checkAndShowNotifications();
            if (this.isLeader()) {
                this.checkPendingRequests();
            }
        }
    });
}


updateHeaderButtonsVisibility() {
    if (!this.data.currentUser) return;
    
    console.log('🔍 Atualizando visibilidade dos botões do header...');
    
    // Botão de Gestão de Músicas
    const musicBtn = $('#musicManagementBtn2');
    if (musicBtn.length > 0) {
        const isWorshipLeader = this.isWorshipLeader();
        console.log('🎵 Botão de músicas:', {
            existe: true,
            isWorshipLeader,
            seráVisível: isWorshipLeader
        });
        
        if (isWorshipLeader) {
            musicBtn.show();
            musicBtn.css('display', 'flex'); // ou 'inline-flex' dependendo do seu CSS
        } else {
            musicBtn.hide();
        }
    } else {
        console.log('⚠️ Botão #musicManagementBtn não encontrado no HTML');
    }
    
    // Botão de Gerenciamento (membros)
    const managementBtn = $('#managementBtn');
    if (managementBtn.length > 0) {
        managementBtn.toggle(this.isLeader());
    }
    
    // Botão de Solicitações
    const requestsBtn = $('#pendingRequestsBtn');
    if (requestsBtn.length > 0) {
        requestsBtn.toggle(this.isLeader());
    }
}

async checkPendingRequests() {
    if (!this.isLeader()) return;
    
    // CORREÇÃO: Verificar se está logado antes de fazer a requisição
    if (!this.isLoggedIn()) {
        console.warn('⚠️ Usuário não está logado, pulando verificação de solicitações');
        return;
    }
    
    try {
        const response = await this.apiCall('/unavailability/pending').catch(error => {
            console.warn('⚠️ Erro ao verificar solicitações pendentes:', error.message);
            
            // CORREÇÃO: Não fazer nada para erros de token, já que o apiCall já trata
            if (error.message.includes('Token não encontrado') || error.message.includes('401')) {
                return null;
            }
            
            this.showToast('Erro ao verificar solicitações', 'error');
            return null;
        });
        
        if (response && response.success) {
            let pendingRequests = [];
            if (response.data && response.data.pending_requests) {
                pendingRequests = response.data.pending_requests;
            }
            
            const oldCount = this.data.pendingRequests?.length || 0;
            const newCount = pendingRequests.length;
            
            this.data.pendingRequests = pendingRequests;
            this.updatePendingRequestsBadge(pendingRequests);
            
            if (newCount > oldCount && oldCount > 0) {
                const newRequests = newCount - oldCount;
                this.showToast(`📋 ${newRequests} nova(s) solicitação(ões) de indisponibilidade`, 'warning');
            }
        }
    } catch (error) {
        console.error('❌ Erro ao verificar solicitações pendentes:', error);
        // CORREÇÃO: Não mostrar toast para erros de autenticação
        if (!error.message.includes('Token') && !error.message.includes('401')) {
            this.showToast('Erro ao verificar solicitações', 'error');
        }
    }
}

// Adicione este método na sua classe ChurchTimeApp
loadReportsScreen() {
    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Relatórios e Dashboard</h2>
            <div class="header-actions">
                <span class="view-all" id="refreshReports">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </span>
                <span class="view-all" id="exportReports" style="margin-left: 10px;">
                    <i class="fas fa-download"></i> Exportar
                </span>
            </div>
        </div>
        
        <!-- Filtros -->
        <div class="card">
            <div class="management-filters">
                <div class="filter-group">
                    <label>Período:</label>
                    <div style="display: flex; gap: 10px;">
                        <input type="date" class="form-input" id="reportStartDate">
                        <span>até</span>
                        <input type="date" class="form-input" id="reportEndDate">
                    </div>
                </div>
                <div class="filter-group">
                    <label>Ministério:</label>
                    <select class="form-select" id="reportMinistry">
                        <option value="">Todos os ministérios</option>
                        ${this.data.ministries.map(m => 
                            `<option value="${m.id}">${m.name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="filter-group">
                    <label>Tipo de Relatório:</label>
                    <select class="form-select" id="reportType">
                        <option value="overview">Visão Geral</option>
                        <option value="scales">Escalas</option>
                        <option value="unavailability">Indisponibilidades</option>
                        <option value="members">Membros</option>
                        <option value="songs">Músicas</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="applyFilters">
                    <i class="fas fa-filter"></i> Aplicar Filtros
                </button>
            </div>
        </div>
        
        <!-- Cards de Resumo -->
        <div class="stats-grid" id="summaryCards">
            <div class="stat-card fade-in">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-users"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="totalMembers">0</div>
                    <div class="stat-label">Membros Ativos</div>
                </div>
            </div>
            
            <div class="stat-card fade-in">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="totalScales">0</div>
                    <div class="stat-label">Escalas</div>
                </div>
            </div>
            
            <div class="stat-card fade-in">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-user-clock"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="totalUnavailability">0</div>
                    <div class="stat-label">Indisponibilidades</div>
                </div>
            </div>
            
            <div class="stat-card fade-in">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-music"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value" id="confirmationRate">0%</div>
                    <div class="stat-label">Taxa de Confirmação</div>
                </div>
            </div>
        </div>
        
        <!-- Indicadores Principais -->
        <div class="dashboard-grid">
            <!-- Membro mais escalado -->
            <div class="card dashboard-card">
                <div class="card-header">
                    <h3><i class="fas fa-star"></i> Membro Mais Escalado</h3>
                </div>
                <div class="card-body" id="mostScaledMember">
                    <div class="loading-indicator">Carregando...</div>
                </div>
            </div>
            
            <!-- Membro com mais indisponibilidades -->
            <div class="card dashboard-card">
                <div class="card-header">
                    <h3><i class="fas fa-user-slash"></i> Mais Indisponibilidades</h3>
                </div>
                <div class="card-body" id="mostUnavailabilityMember">
                    <div class="loading-indicator">Carregando...</div>
                </div>
            </div>
            
            <!-- Músicas mais tocadas -->
            <div class="card dashboard-card">
                <div class="card-header">
                    <h3><i class="fas fa-chart-line"></i> Top 5 Músicas</h3>
                </div>
                <div class="card-body" id="topSongs">
                    <div class="loading-indicator">Carregando...</div>
                </div>
            </div>
            
            <!-- Vocalistas mais escalados -->
            <div class="card dashboard-card">
                <div class="card-header">
                    <h3><i class="fas fa-microphone"></i> Top Vocalistas</h3>
                </div>
                <div class="card-body" id="topVocalists">
                    <div class="loading-indicator">Carregando...</div>
                </div>
            </div>
        </div>
        
        <!-- Gráficos e Estatísticas -->
        <div class="dashboard-grid">
            <!-- Taxa de Confirmação -->
            <div class="card dashboard-card chart-card">
                <div class="card-header">
                    <h3><i class="fas fa-percentage"></i> Taxa de Confirmação</h3>
                </div>
                <div class="card-body">
                    <div class="chart-container">
                        <canvas id="confirmationChart"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Indisponibilidades por Status -->
            <div class="card dashboard-card chart-card">
                <div class="card-header">
                    <h3><i class="fas fa-exclamation-triangle"></i> Indisponibilidades por Status</h3>
                </div>
                <div class="card-body">
                    <div class="chart-container">
                        <canvas id="unavailabilityChart"></canvas>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Gráfico de Escalas por Mês -->
        <div class="card dashboard-card full-width">
            <div class="card-header">
                <h3><i class="fas fa-chart-bar"></i> Escalas por Mês</h3>
            </div>
            <div class="card-body">
                <div class="chart-container">
                    <canvas id="scalesByMonthChart"></canvas>
                </div>
            </div>
        </div>
        
        <!-- Tabela de Ministérios Mais Ativos -->
        <div class="card dashboard-card">
            <div class="card-header">
                <h3><i class="fas fa-church"></i> Ministérios Mais Ativos</h3>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table" id="topMinistriesTable">
                        <thead>
                            <tr>
                                <th>Posição</th>
                                <th>Ministério</th>
                                <th>Escalas</th>
                                <th>Taxa de Confirmação</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="4" class="text-center">Carregando...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Tabela de Membros Mais Escalados -->
        <div class="card dashboard-card full-width">
            <div class="card-header">
                <h3><i class="fas fa-trophy"></i> Top 10 Membros Mais Escalados</h3>
                <span class="view-all" id="viewAllMembers">Ver todos</span>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table" id="topMembersTable">
                        <thead>
                            <tr>
                                <th>Posição</th>
                                <th>Membro</th>
                                <th>Email</th>
                                <th>Escalas</th>
                                <th>Ministérios</th>
                                <th>Funções</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="6" class="text-center">Carregando...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
        
        <!-- Tabela de Histórico de Indisponibilidades -->
        <div class="card dashboard-card full-width">
            <div class="card-header">
                <h3><i class="fas fa-history"></i> Histórico de Indisponibilidades (Últimos 6 meses)</h3>
                <span class="view-all" id="viewUnavailabilityHistory">Ver histórico completo</span>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table" id="unavailabilityHistoryTable">
                        <thead>
                            <tr>
                                <th>Mês</th>
                                <th>Total</th>
                                <th>Aprovadas</th>
                                <th>Pendentes</th>
                                <th>Rejeitadas</th>
                                <th>Duração Média (dias)</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="6" class="text-center">Carregando...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>`;
    
    this.setContent(content);
    this.setupReportsEvents();
    this.loadDashboardData();
    
    // Adicionar CSS específico para o dashboard
    this.addDashboardStyles();
}

setupReportsEvents() {
    // Aplicar filtros
    document.getElementById('applyFilters').addEventListener('click', () => {
        this.loadDashboardData();
    });
    
    // Atualizar relatórios
    document.getElementById('refreshReports').addEventListener('click', () => {
        this.loadDashboardData();
    });
    
    // Exportar relatórios
    document.getElementById('exportReports').addEventListener('click', () => {
        this.exportReports();
    });
    
    // Ver todos os membros
    document.getElementById('viewAllMembers').addEventListener('click', () => {
        this.loadTopMembersReport();
    });
    
    // Ver histórico completo
    document.getElementById('viewUnavailabilityHistory').addEventListener('click', () => {
        this.loadUnavailabilityHistory();
    });
    
    // Mudar tipo de relatório
    document.getElementById('reportType').addEventListener('change', (e) => {
        if (e.target.value !== 'overview') {
            this.loadDetailedReport(e.target.value);
        } else {
            this.loadDashboardData();
        }
    });
}

async loadDashboardData() {
    try {
        this.showLoading();
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const ministryId = document.getElementById('reportMinistry').value;
        
        // Configurar datas padrão se não preenchidas
        if (!startDate || !endDate) {
            const end = new Date();
            const start = new Date();
            start.setMonth(start.getMonth() - 6);
            
            document.getElementById('reportStartDate').value = start.toISOString().split('T')[0];
            document.getElementById('reportEndDate').value = end.toISOString().split('T')[0];
        }
        
        // Construir query parameters
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        
        const endpoint = `/api/reports/dashboard${params.toString() ? `?${params.toString()}` : ''}`;
        
        // Usar sua função apiCall
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.updateDashboard(result.data);
            
            // Carregar dados adicionais em paralelo
            await Promise.all([
                this.loadTopMembersData(startDate, endDate, ministryId),
                this.loadUnavailabilityHistoryData(),
                this.loadTopSongsData(startDate, endDate, ministryId)
            ]);
        } else {
            throw new Error(result.error || 'Erro ao carregar dashboard');
        }
        
    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
        this.showError('Erro ao carregar relatórios: ' + error.message);
    } finally {
        this.hideLoading();
    }
}

async loadAdditionalData(startDate, endDate, ministryId) {
    console.log('DEBUG: loadAdditionalData chamado');
    
    try {
        // Carregar membros mais escalados
        await this.loadTopMembersData(startDate, endDate, ministryId);
        console.log('DEBUG: Top membros carregado');
        
        // Carregar histórico de indisponibilidades
        await this.loadUnavailabilityHistoryData();
        console.log('DEBUG: Histórico de indisponibilidades carregado');
        
        // Carregar músicas mais tocadas
        await this.loadTopSongsData(startDate, endDate, ministryId);
        console.log('DEBUG: Top músicas carregado');
        
    } catch (error) {
        console.error('Erro ao carregar dados adicionais:', error);
    }
}


updateDashboard(data) {
    console.log('DEBUG: updateDashboard chamado com data:', data);
    
    // Atualizar cards de resumo
    document.getElementById('totalMembers').textContent = data.summary?.total_members || 0;
    document.getElementById('totalScales').textContent = data.summary?.total_scales || 0;
    document.getElementById('totalUnavailability').textContent = data.summary?.total_unavailability || 0;
    document.getElementById('confirmationRate').textContent = `${data.scale_confirmation_rate || 0}%`;
    
    console.log('DEBUG: Cards de resumo atualizados');
    
    // Atualizar membro mais escalado
    this.updateMemberCard('mostScaledMember', data.member_most_scaled, 
        'Membro Mais Escalado', 'fas fa-star', 'Nenhum membro escalado no período');
    
    console.log('DEBUG: Membro mais escalado atualizado');
    
    // Atualizar membro com mais indisponibilidades
    this.updateMemberCard('mostUnavailabilityMember', data.member_most_unavailability, 
        'Mais Indisponibilidades', 'fas fa-user-slash', 'Nenhuma indisponibilidade no período');
    
    console.log('DEBUG: Membro com mais indisponibilidades atualizado');
    
    // VERIFICAR SE O ELEMENTO EXISTE ANTES DE ATUALIZAR
    const leastScaledElement = document.getElementById('leastScaledMember');
    if (leastScaledElement && data.member_least_scaled) {
        this.updateMemberCard('leastScaledMember', data.member_least_scaled,
            'Membro Menos Escalado', 'fas fa-user-clock', 'Nenhum membro escalado no período');
        console.log('DEBUG: Membro menos escalado atualizado');
    }
    
    // Atualizar top músicas
    this.updateTopSongs(data.top_songs);
    console.log('DEBUG: Top músicas atualizado');
    
    // Atualizar top vocalistas
    this.updateTopVocalists(data.top_vocalists);
    console.log('DEBUG: Top vocalistas atualizado');
    
    // Atualizar estatísticas de crescimento (se houver elemento)
    if (document.getElementById('memberGrowth')) {
        this.updateMemberGrowth(data.member_growth);
    }
    
    // Atualizar taxa média de escalas por membro (se houver elemento)
    if (document.getElementById('avgScalesPerMember')) {
        this.updateAvgScalesPerMember(data.avg_scales_per_member);
    }
    
    // Atualizar ministérios mais ativos
    this.updateTopMinistries(data.top_ministries);
    console.log('DEBUG: Top ministérios atualizado');
    
    // Criar gráficos (verificar se os elementos existem)
    this.createCharts(data);
    console.log('DEBUG: Gráficos criados');
}

updateMemberCard(elementId, memberData, title, icon, emptyMessage) {
    const element = document.getElementById(elementId);
    
    if (!element) {
        console.warn(`⚠️ Elemento #${elementId} não encontrado no DOM`);
        return;
    }
    
    if (!memberData) {
        element.innerHTML = `
            <div class="empty-state">
                <i class="${icon}"></i>
                <p>${emptyMessage}</p>
            </div>
        `;
        return;
    }
    
    element.innerHTML = `
        <div class="member-highlight">
            <div class="member-avatar">
                <i class="fas fa-user"></i>
            </div>
            <div class="member-info">
                <h4>${memberData.name}</h4>
                <p>${title}: ${memberData.total}</p>
            </div>
        </div>
    `;
    
    console.log(`DEBUG: Elemento #${elementId} atualizado com sucesso`);
}

updateTopSongs(songs) {
    const element = document.getElementById('topSongs');
    
    if (!element) {
        console.warn('⚠️ Elemento #topSongs não encontrado');
        return;
    }
    
    if (!songs || songs.length === 0) {
        element.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-music"></i>
                <p>Nenhuma música escalada no período</p>
            </div>
        `;
        return;
    }
    
    let html = '<ul class="top-list">';
    songs.forEach((song, index) => {
        html += `
            <li class="top-item">
                <span class="rank">${index + 1}</span>
                <div class="song-info">
                    <strong>${song.title}</strong>
                    <small>${song.artist || 'Artista desconhecido'}</small>
                </div>
                <span class="count">${song.total}x</span>
            </li>
        `;
    });
    html += '</ul>';
    
    element.innerHTML = html;
}


updateTopVocalists(vocalists) {
    const element = document.getElementById('topVocalists');
    
    if (!element) {
        console.warn('⚠️ Elemento #topVocalists não encontrado');
        return;
    }
    
    if (!vocalists || vocalists.length === 0) {
        element.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-microphone"></i>
                <p>Nenhum vocalista escalado no período</p>
            </div>
        `;
        return;
    }
    
    let html = '<ul class="top-list">';
    vocalists.forEach((vocalist, index) => {
        html += `
            <li class="top-item">
                <span class="rank">${index + 1}</span>
                <div class="vocalist-info">
                    <strong>${vocalist.name}</strong>
                </div>
                <span class="count">${vocalist.total}x</span>
            </li>
        `;
    });
    html += '</ul>';
    
    element.innerHTML = html;
}

updateTopMinistries(ministries) {
    const tbody = document.querySelector('#topMinistriesTable tbody');
    
    if (!tbody) {
        console.warn('⚠️ Tabela #topMinistriesTable não encontrada');
        return;
    }
    
    if (!ministries || ministries.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center">Nenhum ministério com escalas no período</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    ministries.forEach((ministry, index) => {
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>${ministry.name}</td>
                <td>${ministry.total_scales}</td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${Math.min(ministry.total_scales * 10, 100)}%"></div>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async loadTopMembersData(startDate, endDate, ministryId) {
    try {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        params.append('limit', '10');
        
        const endpoint = `/api/reports/top-members?${params.toString()}`;
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.updateTopMembersTable(result.data.top_members);
        }
    } catch (error) {
        console.error('Erro ao carregar top membros:', error);
    }
}


updateTopMembersTable(members) {
    const tbody = document.querySelector('#topMembersTable tbody');
    
    if (!members || members.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">Nenhum membro escalado no período</td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    members.forEach((member, index) => {
        const ministries = member.user_ministries?.join(', ') || 'Não especificado';
        const roles = member.roles?.join(', ') || 'Não especificado';
        
        html += `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="member-cell">
                        <div class="member-avatar-small">
                            <i class="fas fa-user"></i>
                        </div>
                        <div>
                            <strong>${member.name}</strong><br>
                            <small>${member.phone || 'Sem telefone'}</small>
                        </div>
                    </div>
                </td>
                <td>${member.email}</td>
                <td><span class="badge badge-primary">${member.total_scales}</span></td>
                <td>${ministries}</td>
                <td>${roles}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async loadUnavailabilityHistoryData() {
    try {
        const endpoint = '/api/reports/unavailability-history?months=6';
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.updateUnavailabilityHistoryTable(result.data.history);
        }
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
    }
}
updateUnavailabilityHistoryTable(history) {
    const tbody = document.querySelector('#unavailabilityHistoryTable tbody');
    
    if (!history || Object.keys(history).length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">Nenhuma indisponibilidade nos últimos 6 meses</td>
            </tr>
        `;
        return;
    }
    
    // Ordenar meses em ordem decrescente
    const months = Object.keys(history).sort().reverse();
    
    let html = '';
    months.forEach(month => {
        const data = history[month];
        const [year, monthNum] = month.split('-');
        const monthName = this.getMonthName(parseInt(monthNum));
        
        html += `
            <tr>
                <td>${monthName}/${year}</td>
                <td><strong>${data.total}</strong></td>
                <td><span class="badge badge-success">${data.approved || 0}</span></td>
                <td><span class="badge badge-warning">${data.pending || 0}</span></td>
                <td><span class="badge badge-danger">${data.rejected || 0}</span></td>
                <td>${data.avg_duration || 0}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async loadTopSongsData(startDate, endDate, ministryId) {
    try {
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        params.append('limit', '5');
        
        const endpoint = `/api/reports/top-songs?${params.toString()}`;
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.updateTopSongs(result.data.top_songs);
        }
    } catch (error) {
        console.error('Erro ao carregar top músicas:', error);
    }
}

createCharts(data) {
    console.log('DEBUG: createCharts chamado');
    
    // Gráfico de taxa de confirmação
    const confirmationChartEl = document.getElementById('confirmationChart');
    if (confirmationChartEl) {
        this.createConfirmationChart(data.scale_confirmation_rate);
        console.log('DEBUG: Gráfico de confirmação criado');
    } else {
        console.warn('⚠️ Canvas #confirmationChart não encontrado');
    }
    
    // Gráfico de indisponibilidades por status
    const unavailabilityChartEl = document.getElementById('unavailabilityChart');
    if (unavailabilityChartEl) {
        this.createUnavailabilityChart(data.unavailability_by_status);
        console.log('DEBUG: Gráfico de indisponibilidades criado');
    } else {
        console.warn('⚠️ Canvas #unavailabilityChart não encontrado');
    }
    
    // Gráfico de escalas por mês
    const scalesByMonthChartEl = document.getElementById('scalesByMonthChart');
    if (scalesByMonthChartEl && data.scales_by_month) {
        this.createScalesByMonthChart(data.scales_by_month);
        console.log('DEBUG: Gráfico de escalas por mês criado');
    } else if (!data.scales_by_month) {
        console.warn('⚠️ Dados scales_by_month não encontrados');
    }
}


createConfirmationChart(rate) {
    const ctx = document.getElementById('confirmationChart').getContext('2d');
    
    // Destruir gráfico anterior se existir
    if (this.confirmationChart) {
        this.confirmationChart.destroy();
    }
    
    this.confirmationChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Confirmadas', 'Não Confirmadas'],
            datasets: [{
                data: [rate, 100 - rate],
                backgroundColor: ['#4CAF50', '#f44336'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw}%`;
                        }
                    }
                }
            }
        }
    });
}

createUnavailabilityChart(statusData) {
    const ctx = document.getElementById('unavailabilityChart').getContext('2d');
    
    // Destruir gráfico anterior se existir
    if (this.unavailabilityChart) {
        this.unavailabilityChart.destroy();
    }
    
    const labels = ['Aprovadas', 'Pendentes', 'Rejeitadas'];
    const data = [
        statusData.approved || 0,
        statusData.pending || 0,
        statusData.rejected || 0
    ];
    
    this.unavailabilityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Quantidade',
                data: data,
                backgroundColor: ['#4CAF50', '#FFC107', '#F44336'],
                borderColor: ['#45a049', '#ff9800', '#e53935'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
}

createScalesByMonthChart(scalesData) {
    const ctx = document.getElementById('scalesByMonthChart').getContext('2d');
    
    // Destruir gráfico anterior se existir
    if (this.scalesByMonthChart) {
        this.scalesByMonthChart.destroy();
    }
    
    // Ordenar meses
    const months = Object.keys(scalesData).sort();
    const data = months.map(month => scalesData[month]);
    
    // Converter meses para formato legível
    const labels = months.map(month => {
        const [year, monthNum] = month.split('-');
        return `${this.getMonthName(parseInt(monthNum))}/${year.substring(2)}`;
    });
    
    this.scalesByMonthChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Escalas por Mês',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.2)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 2,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                }
            }
        }
    });
}

updateMemberGrowth(growthData) {
    // Esta função pode ser usada para mostrar crescimento de membros
    console.log('Dados de crescimento:', growthData);
}

updateAvgScalesPerMember(avg) {
    // Esta função pode ser usada para mostrar média de escalas por membro
    console.log('Média de escalas por membro:', avg);
}

async loadDetailedReport(reportType) {
    try {
        this.showLoading();
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const ministryId = document.getElementById('reportMinistry').value;
        
        const params = new URLSearchParams();
        params.append('type', reportType);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        
        const endpoint = `/api/reports/detailed?${params.toString()}`;
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.displayDetailedReport(reportType, result.data);
        } else {
            throw new Error(result.error || 'Erro ao carregar relatório');
        }
        
    } catch (error) {
        console.error('Erro ao carregar relatório detalhado:', error);
        this.showError('Erro ao carregar relatório detalhado: ' + error.message);
    } finally {
        this.hideLoading();
    }
}

displayDetailedReport(reportType, data) {
    let content = '';
    
    switch(reportType) {
        case 'scales':
            content = this.createScalesReportContent(data);
            break;
        case 'unavailability':
            content = this.createUnavailabilityReportContent(data);
            break;
        case 'members':
            content = this.createMembersReportContent(data);
            break;
        case 'songs':
            content = this.createSongsReportContent(data);
            break;
    }
    
    // Substituir o conteúdo da seção principal
    document.querySelector('.content-section').innerHTML = content;
    
    // Reconfigurar eventos
    this.setupReportsEvents();
}

createScalesReportContent(data) {
    return `
    <div class="content-section">
        <div class="section-title">
            <h2>Relatório de Escalas</h2>
            <div class="header-actions">
                <button class="btn btn-secondary" id="backToDashboard">
                    <i class="fas fa-arrow-left"></i> Voltar ao Dashboard
                </button>
                <span class="view-all" id="exportReport">
                    <i class="fas fa-download"></i> Exportar
                </span>
            </div>
        </div>
        
        <!-- Estatísticas -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-calendar-alt"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${data.total_scales}</div>
                    <div class="stat-label">Total de Escalas</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-check-circle"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${data.confirmed_scales}</div>
                    <div class="stat-label">Confirmadas</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-clock"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${data.pending_scales}</div>
                    <div class="stat-label">Pendentes</div>
                </div>
            </div>
            
            <div class="stat-card">
                <div class="stat-header">
                    <div class="stat-icon">
                        <i class="fas fa-percentage"></i>
                    </div>
                </div>
                <div class="stat-content">
                    <div class="stat-value">${data.confirmation_rate}%</div>
                    <div class="stat-label">Taxa de Confirmação</div>
                </div>
            </div>
        </div>
        
        <!-- Gráfico -->
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3>Escalas por Mês</h3>
            </div>
            <div class="card-body">
                <div class="chart-container">
                    <canvas id="detailedScalesChart"></canvas>
                </div>
            </div>
        </div>
        
        <!-- Tabela de Membros Mais Escalados -->
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3>Top 10 Membros Mais Escalados</h3>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Posição</th>
                                <th>Membro</th>
                                <th>Escalas</th>
                                <th>Percentual</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.top_members.map((member, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${member.name}</td>
                                    <td>${member.count}</td>
                                    <td>
                                        <div class="progress-bar">
                                            <div class="progress-fill" style="width: ${(member.count / data.total_scales * 100).toFixed(1)}%"></div>
                                            <span>${(member.count / data.total_scales * 100).toFixed(1)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>`;
}

async loadTopMembersReport() {
    try {
        this.showLoading();
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const ministryId = document.getElementById('reportMinistry').value;
        
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        params.append('limit', '50'); // Mais membros no relatório completo
        
        const endpoint = `/api/reports/top-members?${params.toString()}`;
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.displayTopMembersReport(result.data);
        } else {
            throw new Error(result.error || 'Erro ao carregar relatório de membros');
        }
        
    } catch (error) {
        console.error('Erro ao carregar relatório de membros:', error);
        this.showError('Erro ao carregar relatório de membros: ' + error.message);
    } finally {
        this.hideLoading();
    }
}

displayTopMembersReport(data) {
    const content = `
    <div class="content-section">
        <div class="section-title">
            <h2>Relatório de Membros Mais Escalados</h2>
            <div class="header-actions">
                <button class="btn btn-secondary" onclick="churchTimeApp.loadReportsScreen()">
                    <i class="fas fa-arrow-left"></i> Voltar
                </button>
                <button class="btn btn-primary" onclick="churchTimeApp.exportReport('members')">
                    <i class="fas fa-download"></i> Exportar
                </button>
            </div>
        </div>
        
        <div class="card">
            <div class="card-header">
                <h3>Resumo</h3>
            </div>
            <div class="card-body">
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <div class="stat-icon">
                                <i class="fas fa-users"></i>
                            </div>
                        </div>
                        <div class="stat-content">
                            <div class="stat-value">${data.summary?.total_active_members || 0}</div>
                            <div class="stat-label">Membros Ativos</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-header">
                            <div class="stat-icon">
                                <i class="fas fa-chart-line"></i>
                            </div>
                        </div>
                        <div class="stat-content">
                            <div class="stat-value">${data.summary?.avg_scales_per_member || 0}</div>
                            <div class="stat-label">Média de Escalas</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <div class="card" style="margin-top: 20px;">
            <div class="card-header">
                <h3>Top ${data.top_members?.length || 0} Membros Mais Escalados</h3>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Posição</th>
                                <th>Membro</th>
                                <th>Email</th>
                                <th>Telefone</th>
                                <th>Escalas</th>
                                <th>Funções</th>
                                <th>Ministérios</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.top_members?.map((member, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>
                                        <div class="member-cell">
                                            <div class="member-avatar-small">
                                                <i class="fas fa-user"></i>
                                            </div>
                                            <div>
                                                <strong>${member.name}</strong>
                                            </div>
                                        </div>
                                    </td>
                                    <td>${member.email || 'Não informado'}</td>
                                    <td>${member.phone || 'Não informado'}</td>
                                    <td><span class="badge badge-primary">${member.total_scales}</span></td>
                                    <td>${member.roles?.join(', ') || 'Não especificado'}</td>
                                    <td>${member.user_ministries?.join(', ') || 'Não especificado'}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="7" class="text-center">Nenhum dado encontrado</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>`;
    
    this.setContent(content);
}

async loadUnavailabilityHistory() {
    try {
        this.showLoading();
        
        const months = prompt('Quantos meses de histórico?', '12');
        if (!months) return;
        
        const endpoint = `/api/reports/unavailability-history?months=${months}`;
        
        const result = await this.apiCall(endpoint, 'GET');
        
        if (result.success) {
            this.displayUnavailabilityHistoryReport(result.data);
        } else {
            throw new Error(result.error || 'Erro ao carregar histórico');
        }
        
    } catch (error) {
        console.error('Erro ao carregar histórico:', error);
        this.showError('Erro ao carregar histórico: ' + error.message);
    } finally {
        this.hideLoading();
    }
}

async exportReports() {
    try {
        this.showLoading();
        
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        const ministryId = document.getElementById('reportMinistry').value;
        const reportType = document.getElementById('reportType').value;
        
        const params = new URLSearchParams();
        params.append('type', reportType);
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (ministryId) params.append('ministry_id', ministryId);
        
        const endpoint = `/api/reports/export?${params.toString()}`;
        
        // Para exportação, você pode precisar de um tratamento diferente
        const response = await fetch(`${this.baseURL}${endpoint}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json',
            }
        });
        
        if (!response.ok) {
            throw new Error('Erro ao exportar relatório');
        }
        
        // Criar blob e fazer download
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `relatorio_${reportType}_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        this.showToast('Relatório exportado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao exportar relatório:', error);
        this.showError('Erro ao exportar relatório: ' + error.message);
    } finally {
        this.hideLoading();
    }
}


getMonthName(monthNumber) {
    const months = [
        'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
        'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
    ];
    return months[monthNumber - 1] || '';
}

addDashboardStyles() {
    const styles = `
    <style>
    .dashboard-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 20px;
        margin-top: 20px;
    }
    
    .dashboard-card {
        height: 100%;
        display: flex;
        flex-direction: column;
    }
    
    .dashboard-card .card-body {
        flex: 1;
        display: flex;
        flex-direction: column;
    }
    
    .dashboard-card.full-width {
        grid-column: 1 / -1;
    }
    
    .chart-card .card-body {
        min-height: 300px;
    }
    
    .chart-container {
        position: relative;
        height: 100%;
        width: 100%;
    }
    
    .top-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }
    
    .top-item {
        display: flex;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid #eee;
    }
    
    .top-item:last-child {
        border-bottom: none;
    }
    
    .rank {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        background: #f0f0f0;
        border-radius: 50%;
        font-weight: bold;
        margin-right: 15px;
    }
    
    .top-item:nth-child(1) .rank {
        background: gold;
        color: #000;
    }
    
    .top-item:nth-child(2) .rank {
        background: silver;
        color: #000;
    }
    
    .top-item:nth-child(3) .rank {
        background: #cd7f32;
        color: #000;
    }
    
    .song-info, .vocalist-info {
        flex: 1;
    }
    
    .song-info strong, .vocalist-info strong {
        display: block;
        font-size: 14px;
    }
    
    .song-info small, .vocalist-info small {
        color: #666;
        font-size: 12px;
    }
    
    .count {
        font-weight: bold;
        color: #4CAF50;
    }
    
    .member-highlight {
        display: flex;
        align-items: center;
        gap: 15px;
    }
    
    .member-avatar {
        width: 60px;
        height: 60px;
        background: #4CAF50;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 24px;
    }
    
    .member-info h4 {
        margin: 0 0 5px 0;
        font-size: 16px;
    }
    
    .member-info p {
        margin: 0;
        color: #666;
        font-size: 14px;
    }
    
    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: #999;
    }
    
    .empty-state i {
        font-size: 48px;
        margin-bottom: 15px;
        opacity: 0.5;
    }
    
    .member-cell {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .member-avatar-small {
        width: 40px;
        height: 40px;
        background: #e0e0e0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #666;
    }
    
    .progress-bar {
        width: 100%;
        height: 20px;
        background: #f0f0f0;
        border-radius: 10px;
        overflow: hidden;
        position: relative;
    }
    
    .progress-fill {
        height: 100%;
        background: #4CAF50;
        transition: width 0.3s ease;
    }
    
    .progress-bar span {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: #333;
    }
    
    @media (max-width: 768px) {
        .dashboard-grid {
            grid-template-columns: 1fr;
        }
        
        .dashboard-card {
            margin-bottom: 15px;
        }
    }
    </style>
    `;
    
    document.head.insertAdjacentHTML('beforeend', styles);
}

// Métodos auxiliares que você já deve ter
showLoading() {
    // Implementar se não existir
    console.log('Mostrar loading...');
}

hideLoading() {
    // Implementar se não existir
    console.log('Esconder loading...');
}

showError(message) {
    // Implementar se não existir
    console.error('Erro:', message);
    alert(message);
}

    // Métodos de utilidade adicionais
    getRandomColor() {
        const colors = ['#7B68EE', '#9370DB', '#6A5ACD', '#483D8B', '#4B0082'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    validatePhone(phone) {
        const re = /^\(?\d{2}\)?[\s-]?\d{4,5}-?\d{4}$/;
        return re.test(phone);
    }

    formatPhone(phone) {
        const cleaned = phone.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{2})(\d{5})(\d{4})$/);
        if (match) {
            return '(' + match[1] + ') ' + match[2] + '-' + match[3];
        }
        return phone;
    }

    exportToCSV(data, filename) {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => JSON.stringify(row[header])).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        window.URL.revokeObjectURL(url);
    }

    importFromCSV(file, callback) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const csv = e.target.result;
            const lines = csv.split('\n');
            const headers = lines[0].split(',');
            const result = [];

            for (let i = 1; i < lines.length; i++) {
                const obj = {};
                const currentline = lines[i].split(',');

                for (let j = 0; j < headers.length; j++) {
                    obj[headers[j]] = currentline[j];
                }
                result.push(obj);
            }

            callback(result);
        };
        reader.readAsText(file);
    }
} // ← FECHAMENTO DA CLASSE ChurchTimeApp

// Inicialização da aplicação - APENAS UMA VEZ
$(document).ready(function() {
    window.churchTimeApp = new ChurchTimeApp();
    
    // Prevenir comportamento padrão de formulários
    $('form').on('submit', function(e) {
        e.preventDefault();
    });
    
    // Fechar modais com ESC
    $(document).on('keyup', function(e) {
        if (e.keyCode === 27) {
            $('.modal').remove();
        }
    });
    
    // Loading global para links
    $(document).on('click', 'a[href="#"]', function(e) {
        e.preventDefault();
        window.churchTimeApp.showLoading('Carregando...');
        setTimeout(() => {
            window.churchTimeApp.hideLoading();
        }, 1000);
    });
});
