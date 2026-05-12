from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Song
from models import User, Ministry
from datetime import datetime
import requests
import re
import time
import json
import os
from difflib import SequenceMatcher

from playwright.sync_api import sync_playwright
import re
import urllib.parse

class SongController:
    
    def __init__(self):
        """Inicializa o controlador e carrega o dataset local"""
        self.local_dataset_path = os.path.join(os.path.dirname(__file__), 'lyric.json')
        self.local_dataset = self._load_local_dataset()
        self.search_cache = {}  # Cache para buscas frequentes
        
        # Padrões regex para extrair artista e música do título
        self.patterns = [
            # Padrão: Artista - Música (LETRA LEGENDADO)
            r'^(.*?)\s+[-–—]\s+(.*?)\s+(?:LETRA|LEGENDADO|LYRICS|OFFICIAL|VIDEO|MÚSICA).*$',
            # Padrão: Artista   Música   LETRA LEGENDADO
            r'^(.*?)\s{2,}(.*?)\s{2,}(?:LETRA|LEGENDADO|LYRICS).*$',
            # Padrão: Música - Artista
            r'^(.*?)\s+[-–—]\s+(.*?)$',
            # Padrão: Artista: Música
            r'^(.*?)\s*[:]\s*(.*?)$',
            # Padrão: Música (feat. Artista)
            r'^(.*?)\s*\((?:feat\.|ft\.|com)\s+(.*?)\)$',
            # Padrão: Música by Artista
            r'^(.*?)\s+by\s+(.*?)$',
            # Padrão: Artista "Música"
            r'^(.*?)\s+["\'](.*?)["\']$',
        ]
    
    def _load_local_dataset(self):
        """Carrega o dataset local de letras"""
        try:
            if os.path.exists(self.local_dataset_path):
                with open(self.local_dataset_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                if isinstance(data, list):
                    print(f"✅ Dataset local carregado: {len(data)} músicas")
                    # Criar índices para busca mais rápida
                    self._create_search_indexes(data)
                elif isinstance(data, dict):
                    # Se for um dicionário com 'songs'
                    if 'songs' in data and isinstance(data['songs'], list):
                        print(f"✅ Dataset local carregado: {len(data['songs'])} músicas")
                        data = data['songs']
                        self._create_search_indexes(data)
                    else:
                        print(f"❌ Estrutura do dataset não reconhecida")
                        data = []
                else:
                    print(f"❌ Dataset não é uma lista ou dicionário. Tipo: {type(data)}")
                    data = []
                
                return data
            else:
                print(f"⚠️  Arquivo não encontrado: {self.local_dataset_path}")
                return []
        except Exception as e:
            print(f"❌ Erro ao carregar dataset local: {e}")
            return []
    
    def _create_search_indexes(self, dataset):
        """Cria índices para busca mais eficiente"""
        self.title_index = {}
        self.artist_index = {}
        self.title_artist_index = {}
        
        for i, item in enumerate(dataset):
            if not isinstance(item, dict):
                continue
            
            title = item.get('title', '').lower().strip()
            artist = item.get('artist', '').lower().strip()
            
            if title:
                # Indexar por palavras do título
                words = re.findall(r'\b\w+\b', title)
                for word in words:
                    if len(word) > 2:  # Ignorar palavras muito curtas
                        if word not in self.title_index:
                            self.title_index[word] = []
                        self.title_index[word].append(i)
            
            if artist:
                # Indexar por palavras do artista
                words = re.findall(r'\b\w+\b', artist)
                for word in words:
                    if len(word) > 2:
                        if word not in self.artist_index:
                            self.artist_index[word] = []
                        self.artist_index[word].append(i)
            
            # Indexar por combinação título-artista
            key = f"{title}|{artist}"
            if key not in self.title_artist_index:
                self.title_artist_index[key] = i
    
    def _extract_from_title(self, title):
        """
        Extrai artista e nome da música de um título complexo
        Retorna: (artista, nome_musica, foi_extraido)
        """
        if not title:
            return "", "", False
        
        original_title = title
        
        # Limpar o título
        title = title.strip()
        
        # Tentar cada padrão regex
        for pattern in self.patterns:
            match = re.match(pattern, title, re.IGNORECASE)
            if match:
                groups = match.groups()
                if len(groups) >= 2:
                    artist = groups[0].strip()
                    song_name = groups[1].strip()
                    
                    # Limpar palavras comuns
                    common_words = ['official', 'video', 'lyrics', 'letra', 'legendado', 'audio', 'music', 
                                   'song', 'hd', '4k', 'vídeo', 'clipe', 'clip', 'música', 'musica']
                    for word in common_words:
                        song_name = re.sub(fr'\b{word}\b', '', song_name, flags=re.IGNORECASE)
                        artist = re.sub(fr'\b{word}\b', '', artist, flags=re.IGNORECASE)
                    
                    song_name = re.sub(r'[\(\[].*?[\)\]]', '', song_name).strip()  # Remover parênteses
                    artist = re.sub(r'[\(\[].*?[\)\]]', '', artist).strip()
                    
                    song_name = song_name.strip()
                    artist = artist.strip()
                    
                    if artist and song_name:
                        print(f"🎭 Extraído do título: '{artist}' - '{song_name}' (de: '{original_title}')")
                        return artist, song_name, True
        
        # Se não encontrou padrão, tentar dividir por múltiplos espaços ou traços
        parts = [p.strip() for p in re.split(r'[-–—\s]{2,}', title) if p.strip()]
        
        if len(parts) >= 2:
            # Verificar qual parte parece ser artista e qual parece ser música
            # Geralmente a última parte é o artista ou palavras descritivas
            song_candidate = parts[0]
            artist_candidate = parts[-1]
            
            # Se temos mais de 2 partes, juntar as do meio no título da música
            if len(parts) > 2:
                song_candidate = ' '.join(parts[:-1])
            
            # Limpar palavras comuns
            common_words = ['official', 'video', 'lyrics', 'letra', 'legendado', 'audio']
            for word in common_words:
                song_candidate = re.sub(fr'\b{word}\b', '', song_candidate, flags=re.IGNORECASE)
                artist_candidate = re.sub(fr'\b{word}\b', '', artist_candidate, flags=re.IGNORECASE)
            
            song_candidate = re.sub(r'[\(\[].*?[\)\]]', '', song_candidate).strip()
            artist_candidate = re.sub(r'[\(\[].*?[\)\]]', '', artist_candidate).strip()
            
            if song_candidate and artist_candidate:
                print(f"🎭 Extraído (fallback): '{artist_candidate}' - '{song_candidate}' (de: '{original_title}')")
                return artist_candidate, song_candidate, True
        
        return "", title, False
    
    def _search_local_dataset(self, title, artist):
        """
        Busca letra no dataset local usando múltiplas estratégias
        """
        if not self.local_dataset or not isinstance(self.local_dataset, list):
            return None, None, False, 0
        
        print(f"🔍 Buscando localmente: Título='{title}', Artista='{artist}'")
        
        # Normalizar busca
        search_title = (title or "").lower().strip()
        search_artist = (artist or "").lower().strip()
        
        # Tentar extrair artista e música do título se necessário
        extracted_artist, extracted_title, was_extracted = self._extract_from_title(search_title)
        
        # Criar múltiplas combinações de busca
        search_combinations = []
        
        # 1. Busca original (título e artista fornecidos)
        if search_title and search_artist:
            search_combinations.append({
                'title': search_title,
                'artist': search_artist,
                'strategy': 'original',
                'priority': 10
            })
        
        # 2. Se extraímos do título
        if was_extracted:
            search_combinations.append({
                'title': extracted_title.lower(),
                'artist': extracted_artist.lower(),
                'strategy': 'extracted_from_title',
                'priority': 9
            })
        
        # 3. Buscar apenas pelo título (sem artista)
        if search_title:
            search_combinations.append({
                'title': search_title,
                'artist': '',
                'strategy': 'title_only',
                'priority': 8
            })
        
        # 4. Buscar apenas pelo artista (sem título)
        if search_artist:
            search_combinations.append({
                'title': '',
                'artist': search_artist,
                'strategy': 'artist_only',
                'priority': 7
            })
        
        # 5. Se tivemos extração, tentar combinações invertidas
        if was_extracted:
            search_combinations.append({
                'title': extracted_artist.lower(),  # Pode ser que o "artista" extraído seja na verdade o título
                'artist': extracted_title.lower(),  # E o "título" extraído seja o artista
                'strategy': 'inverted_extraction',
                'priority': 6
            })
        
        # Ordenar por prioridade
        search_combinations.sort(key=lambda x: x['priority'], reverse=True)
        
        best_score = 0
        best_item = None
        best_strategy = ""
        
        # Tentar cada combinação de busca
        for combo in search_combinations:
            combo_title = combo['title']
            combo_artist = combo['artist']
            strategy = combo['strategy']
            
            print(f"  🔎 Tentando estratégia '{strategy}': título='{combo_title}', artista='{combo_artist}'")
            
            # Buscar usando índices primeiro
            candidates = self._find_candidates(combo_title, combo_artist)
            
            for idx in candidates:
                item = self.local_dataset[idx]
                if not isinstance(item, dict):
                    continue
                
                item_title = item.get('title', '').lower().strip()
                item_artist = item.get('artist', '').lower().strip()
                
                score = self._calculate_match_score(combo_title, combo_artist, item_title, item_artist)
                
                if score > best_score:
                    best_score = score
                    best_item = item
                    best_strategy = strategy
                    
                    if score >= 0.9:  # Match excelente, parar aqui
                        break
            
            if best_score >= 0.9:
                break
        
        if best_item and best_score >= 0.6:
            item_title = best_item.get('title', '').strip()
            item_artist = best_item.get('artist', '').strip()

            print(f"🎯 Match encontrado: '{item_title}' - '{item_artist}'")
            print(f"   Estratégia: {best_strategy}, Score: {best_score:.2f}")
            
            # Extrair letra
            lyrics = self._extract_lyrics(best_item)
            
            termo = urllib.parse.quote(item_title)

            with sync_playwright() as p:
                import re
                browser = p.chromium.launch(
                    headless=True,
                    args=['--disable-blink-features=AutomationControlled']  # Evita detecção
                )
                
                context = browser.new_context(
                    viewport={'width': 1920, 'height': 1080},
                    user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                )
                
                page = context.new_page()
                
                # Navega com mais opções
                page.goto(
                    f"https://www.cifraclub.com.br/?q={termo}",
                    wait_until="domcontentloaded",
                    timeout=45000
                )
                
                # Aguarda elementos específicos aparecerem
                try:
                    page.wait_for_selector('.gsc-result', timeout=10000)
                except:
                    print("⚠️ Resultados não carregaram rapidamente, continuando...")
                
                # Espera extra para carregamento dinâmico
                page.wait_for_timeout(3000)
                
                # VERIFICAÇÃO: Tira screenshot para debug (opcional)
                # page.screenshot(path='debug_cifraclub.png')
                
                # Método 1: Tenta selecionar resultados do Google Search
                links = page.eval_on_selector_all(
                    ".gsc-webResult.gsc-result a.gs-title",
                    """elements => elements
                        .map(e => e.href)
                        .filter(href => href && href.includes('cifraclub.com.br'))
                    """
                )
                
                # Método 2: Se o primeiro não funcionar, busca links gerais
                if not links:
                    links = page.eval_on_selector_all(
                        "a[href*='cifraclub.com.br']",
                        """elements => elements
                            .map(e => e.href)
                            .filter(href => 
                                href &&
                                /cifraclub\\.com\\.br\\/[a-z0-9\\-]+\\/[a-z0-9\\-]+\\/?$/i.test(href) &&
                                !href.includes('/video/') &&
                                !href.includes('/musico/') &&
                                !href.includes('/artista/') &&
                                !href.includes('/radio/') &&
                                !href.includes('/noticias/')
                            )
                        """
                    )
                
                # Método 3: Busca no HTML da página
                if not links:
                    page_content = page.content()
                    import re
                    # Procura padrões de links de cifras
                    all_links = re.findall(r'href=["\'](https?://www\.cifraclub\.com\.br/[^"\']+)["\']', page_content)
                    links = [
                        link for link in all_links
                        if re.match(r'^https?://www\.cifraclub\.com\.br/[a-z0-9\-]+/[a-z0-9\-]+/?$', link, re.I)
                        and not any(x in link for x in ['/video/', '/musico/', '/artista/', '/radio/', '/noticias/'])
                    ]
                
                print(f"🔗 Links encontrados: {len(links)}")
                
                chords = None
                if links:
                    # Filtra melhor resultado baseado no título
                    melhor_link = links[0]
                    for link in links:
                        # Prefere links que contenham palavras do título
                        titulo_lower = item_title.lower()
                        link_lower = link.lower()
                        palavras_titulo = set(titulo_lower.split())
                        palavras_link = set(re.findall(r'[a-z0-9]+', link_lower))
                        
                        correspondencias = palavras_titulo.intersection(palavras_link)
                        if len(correspondencias) > 0:
                            melhor_link = link
                            break
                    
                    chords = melhor_link.replace("www.", "") if melhor_link else None
                    print(f'✅ Cifra encontrada: {chords}')
                else:
                    print('❌ Nenhuma cifra encontrada')
                    # Tenta URL direta como fallback
                    artista_musica_limpo = re.sub(r'[^a-z0-9\-]', '', artista_musica)
                    chords = f"https://cifraclub.com.br/{artista_musica_limpo}"
                    print(f'🔄 Tentando URL direta: {chords}')
                
                browser.close()

            return lyrics, chords, True, best_score
        
        print(f"❌ Nenhum match satisfatório encontrado (melhor score: {best_score:.2f})")
        return None, None, False, 0
    
    def _find_candidates(self, title, artist):
        """Encontra candidatos usando índices"""
        candidates = set()
        
        # Se temos título, buscar por palavras do título
        if title:
            words = re.findall(r'\b\w+\b', title)
            for word in words:
                if len(word) > 2 and word in self.title_index:
                    candidates.update(self.title_index[word])
        
        # Se temos artista, buscar por palavras do artista
        if artist:
            words = re.findall(r'\b\w+\b', artist)
            for word in words:
                if len(word) > 2 and word in self.artist_index:
                    candidates.update(self.artist_index[word])
        
        # Se não encontrou candidatos, usar todos
        if not candidates:
            candidates = set(range(min(100, len(self.local_dataset))))
        
        return list(candidates)
    
    def _calculate_match_score(self, search_title, search_artist, item_title, item_artist):
        """Calcula score de match entre busca e item"""
        score = 0
        
        # 1. Match exato em título E artista
        if search_title and search_artist and item_title and item_artist:
            if search_title == item_title and search_artist == item_artist:
                return 1.0
        
        # 2. Título exato
        if search_title and item_title and search_title == item_title:
            score += 0.7
            
            # Bônus se artista também corresponder
            if search_artist and item_artist:
                artist_sim = SequenceMatcher(None, search_artist, item_artist).ratio()
                score += artist_sim * 0.3
        
        # 3. Artista exato
        elif search_artist and item_artist and search_artist == item_artist:
            score += 0.6
            
            # Bônus se título também corresponder
            if search_title and item_title:
                title_sim = SequenceMatcher(None, search_title, item_title).ratio()
                score += title_sim * 0.4
        
        # 4. Match parcial (substrings)
        else:
            title_match = False
            artist_match = False
            
            # Verificar se search_title está contido em item_title ou vice-versa
            if search_title and item_title:
                if search_title in item_title or item_title in search_title:
                    title_match = True
                    score += 0.4
                else:
                    # Verificar similaridade
                    title_sim = SequenceMatcher(None, search_title, item_title).ratio()
                    if title_sim > 0.7:
                        score += title_sim * 0.4
            
            # Verificar se search_artist está contido em item_artist ou vice-versa
            if search_artist and item_artist:
                if search_artist in item_artist or item_artist in search_artist:
                    artist_match = True
                    score += 0.3
                else:
                    # Verificar similaridade
                    artist_sim = SequenceMatcher(None, search_artist, item_artist).ratio()
                    if artist_sim > 0.7:
                        score += artist_sim * 0.3
            
            # Bônus por ambos corresponderem
            if title_match and artist_match:
                score += 0.2
        
        # 5. Normalizar score para máximo 1.0
        score = min(score, 1.0)
        
        return score
    
    def _extract_lyrics(self, item):
        """Extrai a letra do item do dataset"""
        lyrics_data = item.get('lyrics', {})
        
        if isinstance(lyrics_data, dict):
            # Tentar obter full_text
            lyrics = lyrics_data.get('full_text', '')
            
            # Se não tiver full_text, construir dos paragraphs
            if not lyrics:
                paragraphs = lyrics_data.get('paragraphs', [])
                if paragraphs:
                    formatted_lyrics = []
                    for para in paragraphs:
                        if isinstance(para, dict):
                            text = para.get('text', '')
                            if text:
                                formatted_lyrics.append(text)
                    if formatted_lyrics:
                        lyrics = '\n\n'.join(formatted_lyrics)
        elif lyrics_data:
            lyrics = str(lyrics_data)
        else:
            lyrics = ''
        
        return lyrics
    
    def _search_lrclib_api(self, title, artist, duration=None):
        """Busca letra na API LRCLIB"""
        #return None, None, False
        try:
            params = {
                'track_name': title,
                'artist_name': artist,
            }
            
            if duration:
                params['duration'] = duration
            
            base_url = "https://lrclib.net/api"
            search_url = f"{base_url}/get"
            
            headers = {
                'User-Agent': 'ChurchTimeApp/1.0',
                'Accept': 'application/json'
            }
            
            response = requests.get(search_url, params=params, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                
                if data and not data.get('instrumental', False):
                    lyrics = data.get('plainLyrics', '')
                    synced_lyrics = data.get('syncedLyrics', '')
                    
                    chords = synced_lyrics if synced_lyrics else lyrics
                    
                    if not lyrics and synced_lyrics:
                        lyrics = re.sub(r'\[\d{2}:\d{2}\.\d{2}\]\s*', '', synced_lyrics)
                        lyrics = re.sub(r'\[\d{2}:\d{2}\]\s*', '', lyrics)
                    
                    print(f"✅ API LRCLIB: '{title}' - '{artist}'")
                    return lyrics, chords, True
            
            print(f"❌ API LRCLIB não encontrou: '{title}' - '{artist}'")
            return None, None, False
            
        except requests.exceptions.Timeout:
            print(f"⏱️  Timeout na API LRCLIB")
            return None, None, False
        except Exception as e:
            print(f"❌ Erro na API LRCLIB: {e}")
            return None, None, False
    
    def _search_lyrics_and_chords(self, title, artist):
        """Busca letras usando primeiro dataset local, depois API"""
        print(f"🔍 Buscando: '{title}' - '{artist}'...")
        
        # Verificar cache
        cache_key = f"{title}|{artist}"
        if cache_key in self.search_cache:
            cached = self.search_cache[cache_key]
            if time.time() - cached['timestamp'] < 3600:
                print("⚡ Usando cache")
                return cached['lyrics'], cached['chords'], cached['sources']
        
        # 1. Primeiro tentar no dataset local
        local_lyrics, local_chords, local_found, confidence = self._search_local_dataset(title, artist)
        
        if local_found:
            found_sources = {
                'lyrics': bool(local_lyrics),
                'chords': bool(local_chords),
                'source': 'local_dataset',
                'found': True,
                'confidence': confidence
            }
            
            # Armazenar no cache
            self.search_cache[cache_key] = {
                'lyrics': local_lyrics,
                'chords': local_chords,
                'sources': found_sources,
                'timestamp': time.time()
            }
            
            return local_lyrics, local_chords, found_sources
        
        # 2. Tentar com a API LRCLIB
        print("🌐 Tentando API LRCLIB...")
        lyrics, chords, api_found = self._search_lrclib_api(title, artist)
        
        found_sources = {
            'lyrics': bool(lyrics),
            'chords': bool(chords),
            'source': 'lrclib_api' if api_found else 'none',
            'found': api_found,
            'confidence': 1.0 if api_found else 0.0
        }
        
        # Armazenar no cache se encontrou
        if api_found:
            self.search_cache[cache_key] = {
                'lyrics': lyrics,
                'chords': chords,
                'sources': found_sources,
                'timestamp': time.time()
            }
        
        return lyrics, chords, found_sources
    
    @jwt_required()
    def get_all(self):
        """
        Retorna todas as músicas cadastradas
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            songs = Song.query.all()
            
            # Filtrar por permissões se necessário
            if current_user.role == 'membro' and 'musicas_gerenciar' not in current_user.get_permissions():
                # Membros só veem músicas básicas
                songs_data = [{
                    'id': song.id,
                    'title': song.title,
                    'artist': song.artist,
                    'duration': song.duration,
                    'tags': song.get_tags(),
                    'has_lyrics': bool(song.lyrics),
                    'has_chords': bool(song.chords)
                } for song in songs]
            else:
                # Líderes/admins veem tudo
                songs_data = [song.to_dict() for song in songs]
            
            return jsonify({
                'success': True,
                'data': {
                    'songs': songs_data,
                    'total': len(songs)
                }
            })
            
        except Exception as e:
            print(f"❌ Erro ao buscar músicas: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def create(self):
        """
        Cria uma nova música
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions() or str(current_user.role).lower() != "lider":
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            data = request.get_json()
            
            if not data.get('title') or not data.get('artist'):
                return jsonify({'success': False, 'error': 'Título e artista são obrigatórios'}), 400
            
            # Verificar se música já existe
            existing_song = Song.query.filter_by(
                title=data['title'].strip(),
                artist=data['artist'].strip()
            ).first()
            
            if existing_song:
                return jsonify({
                    'success': False, 
                    'error': 'Esta música já está cadastrada',
                    'existing_id': existing_song.id
                }), 400
            
            # Buscar letra e cifra automaticamente se solicitado
            auto_fetch = data.get('auto_fetch', True)
            provided_lyrics = data.get('lyrics', '')
            provided_chords = data.get('chords', '')
            
            auto_lyrics = None
            auto_chords = None
            found_sources = {'lyrics': False, 'chords': False, 'source': 'none', 'found': False}
            
            # Buscar automaticamente se não fornecido e auto_fetch é True
            if auto_fetch and (not provided_lyrics or not provided_chords):
                print("🔍 Busca automática iniciada...")
                auto_lyrics, auto_chords, found_sources = self._search_lyrics_and_chords(
                    data['title'].strip(), 
                    data['artist'].strip()
                )
            
            # Usar dados fornecidos ou automáticos
            final_lyrics = provided_lyrics if provided_lyrics else (auto_lyrics or '')
            final_chords = provided_chords if provided_chords else (auto_chords or '')
            
            # Processar formato LRC se for letra sincronizada
            is_lrc_format = False
            if final_chords and '[' in final_chords and ']' in final_chords:
                is_lrc_format = True
                print("🎵 Letras sincronizadas (LRC) detectadas")
            
            # Limitar tamanho para o banco
            if final_lyrics and len(final_lyrics) > 10000:
                final_lyrics = final_lyrics[:10000] + "... [texto truncado]"
            
            if final_chords and len(final_chords) > 10000:
                final_chords = final_chords[:10000] + "... [texto truncado]"
            
            # Criar música
            song = Song(
                title=data['title'].strip(),
                artist=data['artist'].strip(),
                youtube_id=data.get('youtubeId', '').strip(),
                duration=data.get('duration', '').strip(),
                lyrics=final_lyrics.strip() if final_lyrics else None,
                chords=final_chords.strip() if final_chords else None
            )
            
            # Adicionar tags se fornecidas
            if 'tags' in data and isinstance(data['tags'], list):
                song.set_tags(data['tags'])
            elif 'tags' in data and isinstance(data['tags'], str):
                tags_list = [tag.strip() for tag in data['tags'].split(',') if tag.strip()]
                song.set_tags(tags_list)
            
            # Adicionar links se fornecidos
            if 'links' in data and isinstance(data['links'], list):
                song.set_links(data['links'])
            
            db.session.add(song)
            db.session.commit()
            
            # Mensagem baseada na fonte
            source_message = ""
            if found_sources['source'] == 'local_dataset' and found_sources['found']:
                source_message = f" (dataset local, confiança: {found_sources.get('confidence', 0):.2f})"
            elif found_sources['source'] == 'lrclib_api' and found_sources['found']:
                source_message = " (letras do LRCLIB)"
            elif not found_sources['found'] and auto_fetch:
                source_message = " (busca automática não encontrou letras)"
            
            return jsonify({
                'success': True,
                'data': {
                    'song': song.to_dict()
                },
                'message': f'Música criada com sucesso!{source_message}',
                'auto_fetched': found_sources,
                'metadata': {
                    'is_lrc_format': is_lrc_format,
                    'lyrics_length': len(final_lyrics) if final_lyrics else 0,
                    'chords_length': len(final_chords) if final_chords else 0
                }
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"💥 Erro crítico ao criar música: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def update(self):
        """
        Atualiza uma música existente
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            data = request.get_json()
            song_id = data.get('id')
            
            if not song_id:
                return jsonify({'success': False, 'error': 'ID da música é obrigatório'}), 400
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions():
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            song = Song.query.get(song_id)
            if not song:
                return jsonify({'success': False, 'error': 'Música não encontrada'}), 404
            
            # Atualizar campos
            update_fields = []
            
            if 'title' in data and data['title'] != song.title:
                song.title = data['title'].strip()
                update_fields.append('título')
            
            if 'artist' in data and data['artist'] != song.artist:
                song.artist = data['artist'].strip()
                update_fields.append('artista')
            
            if 'youtubeId' in data:
                song.youtube_id = data['youtubeId'].strip()
                update_fields.append('YouTube ID')
            
            if 'duration' in data:
                song.duration = data['duration'].strip()
                update_fields.append('duração')
            
            if 'lyrics' in data:
                new_lyrics = data['lyrics'][:10000] if data['lyrics'] else None
                if new_lyrics != song.lyrics:
                    song.lyrics = new_lyrics
                    update_fields.append('letra')
            
            if 'chords' in data:
                new_chords = data['chords'][:10000] if data['chords'] else None
                if new_chords != song.chords:
                    song.chords = new_chords
                    update_fields.append('cifra')
            
            if 'tags' in data:
                if isinstance(data['tags'], list):
                    song.set_tags(data['tags'])
                elif isinstance(data['tags'], str):
                    tags_list = [tag.strip() for tag in data['tags'].split(',') if tag.strip()]
                    song.set_tags(tags_list)
                update_fields.append('tags')
            
            if 'links' in data:
                if isinstance(data['links'], list):
                    song.set_links(data['links'])
                update_fields.append('links')
            
            song.updated_at = datetime.utcnow()
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'data': {
                    'song': song.to_dict()
                },
                'message': f'Música atualizada com sucesso! ({", ".join(update_fields)})' if update_fields else 'Música atualizada!'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"💥 Erro ao atualizar música: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def delete(self):
        """
        Exclui uma música
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            data = request.get_json()
            song_id = data.get('id')
            
            if not song_id:
                return jsonify({'success': False, 'error': 'ID da música é obrigatório'}), 400
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions():
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            song = Song.query.get(song_id)
            if not song:
                return jsonify({'success': False, 'error': 'Música não encontrada'}), 404
            
            # Registrar para logs (opcional)
            print(f"🗑️  Excluindo música: {song.title} - {song.artist} (ID: {song.id})")
            
            db.session.delete(song)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Música excluída com sucesso!',
                'deleted_song': {
                    'id': song_id,
                    'title': song.title,
                    'artist': song.artist
                }
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"💥 Erro ao excluir música: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def fetch_lyrics_chords(self):
        """
        Rota para buscar letra e cifra de uma música específica
        PRIMEIRO no dataset local, DEPOIS na API LRCLIB
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions():
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            data = request.get_json()
            title = data.get('title')
            artist = data.get('artist')
            youtube_id = data.get('youtubeId')
            
            if not title:
                return jsonify({'success': False, 'error': 'Título é obrigatório'}), 400
            
            print(f"🎵 Buscando: Título='{title}', Artista='{artist}', YouTube='{youtube_id}'")
            
            # Verificar cache
            cache_key = f"{title.lower()}|{artist.lower() if artist else ''}"
            if cache_key in self.search_cache:
                cached = self.search_cache[cache_key]
                if time.time() - cached['timestamp'] < 3600:
                    print("⚡ Usando cache")
                    sources_info = cached['sources']
                    return jsonify({
                        'success': True,
                        'data': {
                            'lyrics': cached['lyrics'] or '',
                            'chords': cached['chords'] or '',
                            'found_lyrics': bool(cached['lyrics']),
                            'found_chords': bool(cached['chords']),
                            'sources': sources_info,
                            'messages': [
                                f"✅ Letra encontrada em cache" if cached['lyrics'] else "❌ Letra não encontrada",
                                f"✅ Cifra encontrada em cache" if cached['chords'] else "❌ Cifra não encontrada",
                                f"⚡ Fonte: Cache ({sources_info['source']})"
                            ]
                        }
                    })
            
            lyrics = None
            chords = None
            source = 'none'
            confidence = 0.0
            found = False
            extraction_info = None
            
            # Tentar extrair artista e música do título se necessário
            if title:
                extracted_artist, extracted_title, was_extracted = self._extract_from_title(title)
                if was_extracted:
                    extraction_info = {
                        'original_title': title,
                        'extracted_artist': extracted_artist,
                        'extracted_title': extracted_title,
                        'was_extracted': True
                    }
                    print(f"🎭 Informações extraídas: Artista='{extracted_artist}', Música='{extracted_title}'")
            
            # 1. PRIMEIRO: Buscar no dataset local
            print("📂 Buscando no dataset local...")
            local_lyrics, local_chords, local_found, local_confidence = self._search_local_dataset(title, artist)
            
            if local_found:
                lyrics = local_lyrics
                chords = local_chords
                source = 'local_dataset'
                confidence = local_confidence
                found = True
                print(f"✅ Encontrado no dataset local (confiança: {confidence:.2f})")
            else:
                # 2. SEGUNDO: Se não encontrou localmente, buscar na API LRCLIB
                print("🌐 Dataset local não encontrou, tentando API LRCLIB...")
                
                # Usar artista extraído se disponível
                search_artist = artist
                search_title = title
                
                if extraction_info and extraction_info['was_extracted']:
                    search_artist = extraction_info['extracted_artist'] or artist
                    search_title = extraction_info['extracted_title'] or title
                    print(f"🌐 Usando extração para API: '{search_title}' - '{search_artist}'")
                
                api_lyrics, api_chords, api_found = self._search_lrclib_api(search_title, search_artist)
                
                if api_found:
                    lyrics = api_lyrics
                    chords = api_chords
                    source = 'lrclib_api'
                    confidence = 1.0
                    found = True
                    print("✅ Encontrado na API LRCLIB")
                else:
                    print("❌ Não encontrado em nenhuma fonte")
            
            # Preparar estrutura de sources
            sources_info = {
                'lyrics': bool(lyrics),
                'chords': bool(chords),
                'source': source,
                'found': found,
                'confidence': confidence,
                'youtube_id': youtube_id,
                'extraction_info': extraction_info
            }
            
            # Armazenar no cache se encontrou
            if found:
                self.search_cache[cache_key] = {
                    'lyrics': lyrics,
                    'chords': chords,
                    'sources': sources_info,
                    'timestamp': time.time()
                }
            
            # Mensagens informativas
            messages = []
            
            if extraction_info and extraction_info['was_extracted']:
                messages.append(f"🎭 Extraído do título: '{extraction_info['extracted_artist']}' - '{extraction_info['extracted_title']}'")
            
            if lyrics:
                messages.append(f"✅ Letra encontrada ({len(lyrics)} caracteres)")
            else:
                messages.append("❌ Letra não encontrada")
            
            if chords:
                messages.append(f"✅ Letra/cifra encontrada ({len(chords)} caracteres)")
                if '[' in chords and ']' in chords:
                    messages.append("🎵 Formato: LRC (sincronizado com timestamps)")
            else:
                messages.append("❌ Letra/cifra não encontrada")
            
            if source == 'local_dataset':
                messages.append(f"📂 Fonte: Dataset local (confiança: {confidence:.2f})")
            elif source == 'lrclib_api':
                messages.append("🌐 Fonte: API LRCLIB")
            else:
                messages.append("⚠️  Fonte: Nenhuma")
            
            if youtube_id:
                messages.append(f"🎬 YouTube ID: {youtube_id}")
            
            response_data = {
                'lyrics': lyrics or '',
                'chords': chords or '',
                'found_lyrics': bool(lyrics),
                'found_chords': bool(chords),
                'sources': sources_info,
                'messages': messages,
                'metadata': {
                    'title': title,
                    'artist': artist,
                    'youtube_id': youtube_id,
                    'search_timestamp': datetime.utcnow().isoformat()
                }
            }
            
            # Adicionar informações de extração se disponível
            if extraction_info:
                response_data['extraction'] = extraction_info
            
            return jsonify({
                'success': True,
                'data': response_data
            })
            
        except Exception as e:
            print(f"💥 Erro ao buscar letra/cifra: {e}")
            return jsonify({
                'success': False, 
                'error': str(e),
                'data': {
                    'lyrics': '',
                    'chords': '',
                    'found_lyrics': False,
                    'found_chords': False,
                    'sources': {
                        'lyrics': False,
                        'chords': False,
                        'source': 'error',
                        'found': False,
                        'confidence': 0.0
                    },
                    'messages': [f"❌ Erro: {str(e)}"]
                }
            }), 500
    
    @jwt_required()
    def get_by_id(self, song_id):
        """
        Retorna uma música específica pelo ID
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            song = Song.query.get(song_id)
            if not song:
                return jsonify({'success': False, 'error': 'Música não encontrada'}), 404
            
            # Verificar permissões para ver conteúdo completo
            if current_user.role == 'membro' and 'musicas_gerenciar' not in current_user.get_permissions():
                # Membros veem informações básicas
                song_data = {
                    'id': song.id,
                    'title': song.title,
                    'artist': song.artist,
                    'duration': song.duration,
                    'tags': song.get_tags(),
                    'has_lyrics': bool(song.lyrics),
                    'has_chords': bool(song.chords),
                    'created_at': song.created_at.isoformat() if song.created_at else None
                }
            else:
                # Líderes/admins veem tudo
                song_data = song.to_dict()
            
            return jsonify({
                'success': True,
                'data': {
                    'song': song_data
                }
            })
            
        except Exception as e:
            print(f"❌ Erro ao buscar música: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def search(self):
        """
        Busca músicas por título, artista ou tags
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            query = request.args.get('q', '').strip()
            artist = request.args.get('artist', '').strip()
            tag = request.args.get('tag', '').strip()
            
            # Construir query base
            db_query = Song.query
            
            if query:
                db_query = db_query.filter(
                    (Song.title.ilike(f'%{query}%')) | 
                    (Song.artist.ilike(f'%{query}%'))
                )
            
            if artist:
                db_query = db_query.filter(Song.artist.ilike(f'%{artist}%'))
            
            # Filtro por tag (mais complexo, pois tags estão em JSON)
            if tag:
                db_query = db_query.filter(Song.tags.ilike(f'%"{tag}"%'))
            
            # Ordenar por título
            db_query = db_query.order_by(Song.title)
            
            songs = db_query.all()
            
            # Aplicar filtro de permissões
            if current_user.role == 'membro' and 'musicas_gerenciar' not in current_user.get_permissions():
                songs_data = [{
                    'id': song.id,
                    'title': song.title,
                    'artist': song.artist,
                    'duration': song.duration,
                    'tags': song.get_tags(),
                    'has_lyrics': bool(song.lyrics),
                    'has_chords': bool(song.chords)
                } for song in songs]
            else:
                songs_data = [song.to_dict() for song in songs]
            
            return jsonify({
                'success': True,
                'data': {
                    'songs': songs_data,
                    'total': len(songs),
                    'query': query,
                    'artist_filter': artist,
                    'tag_filter': tag
                }
            })
            
        except Exception as e:
            print(f"❌ Erro na busca: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def reload_local_dataset(self):
        """
        Rota opcional para recarregar o dataset local sem reiniciar o servidor
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions():
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            # Limpar cache
            self.search_cache.clear()
            
            # Recarregar dataset
            self.local_dataset = self._load_local_dataset()
            
            # Contar itens
            if isinstance(self.local_dataset, list):
                item_count = len(self.local_dataset)
            elif isinstance(self.local_dataset, dict):
                if 'songs' in self.local_dataset:
                    item_count = len(self.local_dataset['songs'])
                else:
                    item_count = 1
            else:
                item_count = 0
            
            return jsonify({
                'success': True,
                'message': f'Dataset local recarregado com {item_count} itens',
                'data': {
                    'item_count': item_count,
                    'cache_cleared': True
                }
            })
            
        except Exception as e:
            print(f"❌ Erro ao recarregar dataset: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def debug_dataset(self):
        """
        Método de debug para verificar informações do dataset local
        """
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user or 'musicas_gerenciar' not in current_user.get_permissions():
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            # Informações básicas
            info = {
                'dataset_path': self.local_dataset_path,
                'dataset_exists': os.path.exists(self.local_dataset_path),
                'dataset_type': str(type(self.local_dataset)),
                'dataset_length': len(self.local_dataset) if isinstance(self.local_dataset, list) else 'N/A',
                'cache_size': len(self.search_cache),
            }
            
            # Mostrar algumas músicas do dataset
            sample_songs = []
            if isinstance(self.local_dataset, list):
                for i, song in enumerate(self.local_dataset[:10]):
                    if isinstance(song, dict):
                        sample_songs.append({
                            'index': i,
                            'title': song.get('title', 'Sem título'),
                            'artist': song.get('artist', 'Sem artista'),
                            'title_lower': song.get('title', '').lower(),
                            'artist_lower': song.get('artist', '').lower(),
                            'has_lyrics': 'lyrics' in song,
                        })
            
            return jsonify({
                'success': True,
                'data': {
                    'info': info,
                    'sample_songs': sample_songs
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def test_extraction(self):
        """
        Rota para testar extração de títulos
        """
        try:
            data = request.get_json()
            titles = data.get('titles', [])
            
            if not titles:
                return jsonify({'success': False, 'error': 'Forneça uma lista de títulos'}), 400
            
            results = []
            
            for title in titles:
                artist, song_name, was_extracted = self._extract_from_title(title)
                
                results.append({
                    'original_title': title,
                    'extracted_artist': artist,
                    'extracted_song_name': song_name,
                    'was_extracted': was_extracted
                })
            
            return jsonify({
                'success': True,
                'data': {
                    'results': results,
                    'patterns': self.patterns
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def debug_search(self):
        """
        Debug detalhado da busca
        """
        try:
            data = request.get_json()
            title = data.get('title', '').strip()
            artist = data.get('artist', '').strip()
            
            print(f"🔍 DEBUG Buscando: '{title}' - '{artist}'")
            
            # Informações do dataset
            dataset_info = {
                'is_list': isinstance(self.local_dataset, list),
                'length': len(self.local_dataset) if isinstance(self.local_dataset, list) else 0,
                'has_indexes': hasattr(self, 'title_index') and hasattr(self, 'artist_index'),
                'title_index_size': len(self.title_index) if hasattr(self, 'title_index') else 0,
                'artist_index_size': len(self.artist_index) if hasattr(self, 'artist_index') else 0,
            }
            
            # Testar extração
            extraction_result = {}
            if title:
                extracted_artist, extracted_title, was_extracted = self._extract_from_title(title)
                extraction_result = {
                    'was_extracted': was_extracted,
                    'extracted_artist': extracted_artist,
                    'extracted_title': extracted_title,
                    'original_title': title
                }
            
            # Executar busca
            lyrics, chords, found, confidence = self._search_local_dataset(title, artist)
            
            # Encontrar matches no dataset
            matches = []
            if isinstance(self.local_dataset, list):
                search_title = title.lower() if title else ""
                search_artist = artist.lower() if artist else ""
                
                for i, item in enumerate(self.local_dataset[:100]):  # Limitar a 100 itens
                    if not isinstance(item, dict):
                        continue
                    
                    item_title = item.get('title', '').lower().strip()
                    item_artist = item.get('artist', '').lower().strip()
                    
                    # Calcular score
                    score = self._calculate_match_score(search_title, search_artist, item_title, item_artist)
                    
                    if score > 0.3:  # Mostrar apenas matches razoáveis
                        matches.append({
                            'index': i,
                            'title': item.get('title', ''),
                            'artist': item.get('artist', ''),
                            'score': score,
                            'item_title_lower': item_title,
                            'item_artist_lower': item_artist,
                            'search_title': search_title,
                            'search_artist': search_artist
                        })
                
                # Ordenar por score
                matches.sort(key=lambda x: x['score'], reverse=True)
            
            return jsonify({
                'success': True,
                'data': {
                    'search': {'title': title, 'artist': artist},
                    'dataset_info': dataset_info,
                    'extraction_result': extraction_result,
                    'search_result': {
                        'found': found,
                        'confidence': confidence,
                        'lyrics_length': len(lyrics) if lyrics else 0,
                        'chords_length': len(chords) if chords else 0
                    },
                    'matches': matches[:20],  # Limitar a 20 matches
                    'total_matches': len(matches)
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def search_in_dataset(self):
        """
        Busca direta no dataset local (para testes)
        """
        try:
            data = request.get_json()
            query = data.get('query', '').lower().strip()
            
            if not query:
                return jsonify({'success': False, 'error': 'Query é obrigatória'}), 400
            
            results = []
            
            if isinstance(self.local_dataset, list):
                for i, item in enumerate(self.local_dataset):
                    if not isinstance(item, dict):
                        continue
                    
                    title = item.get('title', '').lower()
                    artist = item.get('artist', '').lower()
                    
                    if query in title or query in artist:
                        results.append({
                            'index': i,
                            'title': item.get('title', ''),
                            'artist': item.get('artist', ''),
                            'has_lyrics': 'lyrics' in item,
                            'match_in_title': query in title,
                            'match_in_artist': query in artist
                        })
            
            return jsonify({
                'success': True,
                'data': {
                    'query': query,
                    'results': results[:50],  # Limitar a 50 resultados
                    'total_results': len(results)
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
