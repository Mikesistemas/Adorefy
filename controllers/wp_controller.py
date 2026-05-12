#!/usr/bin/env python3
"""
Controller de WhatsApp para envio de mensagens de escala
Versão corrigida baseada no padrão do servidor conn.py
"""

import requests
import json
import base64
import hashlib
import hmac
import time
import os
from datetime import datetime, timedelta
import urllib3
import threading 

# Desabilitar warnings de SSL
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class WhatsAppSimpleQueue:
    """Fila simples integrada no WhatsAppController"""
    
    def __init__(self, whatsapp_controller):
        self.wp = whatsapp_controller  # Referência ao WhatsAppController
        
        # Fila de mensagens
        self.queue = []
        self.is_processing = False
        self.is_paused = False
        self.current_index = 0
        
        # Configurações
        self.interval_seconds = 60  # 1 minuto entre envios
        self.max_retries = 2
        
        # Estatísticas
        self.stats = {
            'total_sent': 0,
            'total_failed': 0,
            'total_queued': 0,
            'last_sent': None,
            'queue_size': 0,
            'is_active': False
        }
        
        # Thread de processamento
        self.processing_thread = None
        
        print("✅ WhatsApp Simple Queue inicializada")
    
    def add_message(self, phone, message, scale_id=None, member_id=None):
        """Adiciona mensagem à fila"""
        try:
            message_id = f"msg_{int(time.time())}_{len(self.queue)}"
            
            item = {
                'id': message_id,
                'phone': phone,
                'message': message,
                'scale_id': scale_id,
                'member_id': member_id,
                'status': 'pending',
                'created_at': datetime.now().isoformat(),
                'attempts': 0
            }
            
            self.queue.append(item)
            self.stats['total_queued'] += 1
            self.stats['queue_size'] = len(self.queue)
            
            print(f"📤 Adicionado à fila: {phone} | Posição: {len(self.queue)}")
            print(f"   ID: {message_id}")
            
            # Iniciar processamento se não estiver rodando
            if not self.is_processing:
                self.start_processing()
            
            return message_id
            
        except Exception as e:
            print(f"❌ Erro ao adicionar à fila: {e}")
            return None
    
    def add_batch(self, messages):
        """Adiciona múltiplas mensagens de uma vez"""
        message_ids = []
        
        for msg in messages:
            message_id = self.add_message(
                phone=msg.get('phone'),
                message=msg.get('message'),
                scale_id=msg.get('scale_id'),
                member_id=msg.get('member_id')
            )
            if message_id:
                message_ids.append(message_id)
        
        print(f"✅ Lote adicionado: {len(message_ids)} mensagens")
        return message_ids
    
    def start_processing(self):
        """Inicia o processamento da fila em thread separada"""
        if self.is_processing:
            print("⚠️  Fila já está em processamento")
            return
        
        self.is_processing = True
        self.is_paused = False
        self.stats['is_active'] = True
        
        # Criar thread de processamento
        self.processing_thread = threading.Thread(
            target=self._process_queue,
            daemon=True,
            name="WhatsAppQueueProcessor"
        )
        self.processing_thread.start()
        
        print("🚀 Processamento da fila iniciado")
    
    def _process_queue(self):
        """Processa a fila linearmente com intervalo"""
        print("🔄 Iniciando processamento linear da fila...")
        
        while self.is_processing and not self.is_paused:
            try:
                # Verificar se há mensagens na fila
                if self.current_index >= len(self.queue):
                    # Verificar se novas mensagens foram adicionadas
                    time.sleep(5)
                    continue
                
                # Pegar próxima mensagem
                message_item = self.queue[self.current_index]
                
                if message_item['status'] in ['sent', 'failed']:
                    # Pular mensagens já processadas
                    self.current_index += 1
                    continue
                
                # Atualizar status para processando
                message_item['status'] = 'processing'
                message_item['started_at'] = datetime.now().isoformat()
                
                print(f"\n📤 PROCESSANDO [{self.current_index + 1}/{len(self.queue)}]")
                print(f"   Para: {message_item['phone']}")
                print(f"   ID: {message_item['id']}")
                print(f"   Tentativa: {message_item['attempts'] + 1}/{self.max_retries}")
                
                # Enviar mensagem usando o WhatsAppController
                success = False
                try:
                    success = self.wp.enviar_mensagem_direta(
                        message_item['phone'],
                        message_item['message']
                    )
                except Exception as e:
                    print(f"❌ Erro ao enviar: {e}")
                    success = False
                
                # Atualizar status
                if success:
                    message_item['status'] = 'sent'
                    message_item['sent_at'] = datetime.now().isoformat()
                    self.stats['total_sent'] += 1
                    self.stats['last_sent'] = datetime.now().isoformat()
                    print(f"✅ Enviado com sucesso!")
                else:
                    message_item['attempts'] += 1
                    
                    if message_item['attempts'] >= self.max_retries:
                        message_item['status'] = 'failed'
                        message_item['failed_at'] = datetime.now().isoformat()
                        self.stats['total_failed'] += 1
                        print(f"❌ Falhou após {self.max_retries} tentativas")
                    else:
                        message_item['status'] = 'pending'
                        print(f"⚠️  Falha, tentando novamente mais tarde")
                        # Não avança o índice, tentará novamente no próximo ciclo
                
                # Mover para próxima mensagem
                if message_item['status'] in ['sent', 'failed']:
                    self.current_index += 1
                
                # Atualizar estatísticas
                self.stats['queue_size'] = len([m for m in self.queue if m['status'] in ['pending', 'processing']])
                
                # Aguardar intervalo (exceto se for a última mensagem)
                if self.current_index < len(self.queue):
                    print(f"⏳ Aguardando {self.interval_seconds} segundos...")
                    for i in range(self.interval_seconds):
                        if self.is_paused:
                            break
                        time.sleep(1)
                
            except Exception as e:
                print(f"💥 Erro no processamento da fila: {e}")
                time.sleep(10)  # Pausa em caso de erro grave
        
        print("⏸️  Processamento da fila pausado")
        self.stats['is_active'] = False
    
    def pause(self):
        """Pausa o processamento"""
        if self.is_processing and not self.is_paused:
            self.is_paused = True
            print("⏸️  Fila pausada")
    
    def resume(self):
        """Retoma o processamento"""
        if self.is_processing and self.is_paused:
            self.is_paused = False
            print("▶️  Fila retomada")
    
    def stop(self):
        """Para completamente o processamento"""
        self.is_processing = False
        self.is_paused = False
        self.stats['is_active'] = False
        print("🛑 Processamento da fila parado")
    
    def clear_queue(self, status_filter=None):
        """Limpa a fila"""
        if status_filter:
            self.queue = [m for m in self.queue if m['status'] not in status_filter]
        else:
            # Mantém apenas mensagens pendentes
            self.queue = [m for m in self.queue if m['status'] in ['pending', 'processing']]
        
        self.current_index = 0
        self.stats['queue_size'] = len(self.queue)
        print(f"🧹 Fila limpa. Restantes: {len(self.queue)}")
    
    def get_status(self):
        """Retorna status da fila"""
        pending = len([m for m in self.queue if m['status'] in ['pending', 'processing']])
        sent = len([m for m in self.queue if m['status'] == 'sent'])
        failed = len([m for m in self.queue if m['status'] == 'failed'])
        
        return {
            'is_processing': self.is_processing,
            'is_paused': self.is_paused,
            'current_index': self.current_index,
            'queue_size': len(self.queue),
            'pending': pending,
            'sent': sent,
            'failed': failed,
            'stats': self.stats,
            'current_message': self.queue[self.current_index] if self.current_index < len(self.queue) else None,
            'next_message': self.queue[self.current_index + 1] if self.current_index + 1 < len(self.queue) else None,
            'interval_seconds': self.interval_seconds,
            'estimated_time_remaining': pending * self.interval_seconds
        }
    
    def get_queue_list(self, limit=20):
        """Retorna lista da fila"""
        return {
            'total': len(self.queue),
            'current_index': self.current_index,
            'messages': self.queue[:limit]
        }

class WhatsAppController:
    """Controller para envio de mensagens via WhatsApp API com fila integrada"""
    
    def __init__(self):
        self._load_config()
        # Inicializar fila simples
        self.queue = WhatsAppSimpleQueue(self)
        print("✅ WhatsAppController com fila integrada inicializado")
    
    def _load_config(self):
        """Carrega configurações do WhatsApp"""
        self.MASTER_KEY = os.getenv('WHATSAPP_MASTER_KEY', '')
        self.SERVER_URL = os.getenv('WHATSAPP_SERVER_URL', '')
        self.KEY_PATTERN = "Godisgood+{date}+{ip}"
        self.DATE_FORMAT = "%Y%m%d"
        self.TIMEOUT = 30
    
        
    def get_public_ip(self):
      """Obtém IP público - VERSÃO COM SUPORTE A IPV6"""
      try:
        # URLs específicas para IPv6
        ipv6_services = [
            "https://api64.ipify.org?format=json",  # Específico para IPv6
            "https://v6.ident.me/.json",
            "https://ip6.seeip.org/json"
        ]
        
        ipv4_services = [
            "https://api.ipify.org?format=json",
            "https://ipinfo.io/json"
        ]
        
        # Primeiro tentar IPv6
        print("🔍 Tentando obter IPv6...")
        for service in ipv6_services:
            try:
                response = requests.get(service, timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    ip = data.get('ip')
                    if ip and ':' in ip:  # É IPv6
                        print(f"✅ IPv6 obtido de {service}: {ip}")
                        return ip.strip()
            except Exception as e:
                print(f"⚠️  Falha no serviço IPv6 {service}: {e}")
                continue
        
        # Se não conseguir IPv6, tentar IPv4
        print("🔍 Tentando obter IPv4...")
        for service in ipv4_services:
            try:
                response = requests.get(service, timeout=3)
                if response.status_code == 200:
                    data = response.json()
                    ip = data.get('ip')
                    if ip and '.' in ip:  # É IPv4
                        print(f"✅ IPv4 obtido de {service}: {ip}")
                        return ip.strip()
            except Exception as e:
                print(f"⚠️  Falha no serviço IPv4 {service}: {e}")
                continue
        
        # Fallback - usar o IP que o servidor está vendo
        print("⚠️  Usando fallback para IPv6 do Cloudflare")
        return "2001:4858:aaaa:172:cd0:6dff:fed3:acb4"
        
      except Exception as e:
        print(f"❌ Erro crítico ao obter IP: {e}")
        return "2001:4858:aaaa:172:cd0:6dff:fed3:acb4"  # Fallback fixo
    
    def gerar_chave_cliente(self, ip, date=None):
        """Gera chave do cliente no padrão exigido"""
        if date is None:
            date = datetime.now().strftime(self.DATE_FORMAT)
        
        # Chave plana no padrão: Godisgood+YYYYMMDD+IP
        chave_plana = self.KEY_PATTERN.format(date=date, ip=ip)
        print(f"🔤 Chave plana: {chave_plana}")
        
        # Criptografa com HMAC-SHA256 (MESMO PADRÃO DO SERVIDOR)
        chave_cripto = hmac.new(
            self.MASTER_KEY.encode('utf-8'),
            chave_plana.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        # Converte para base64
        chave_final = base64.b64encode(chave_cripto.encode('utf-8')).decode('utf-8')
        print(f"🔐 Chave final (64 chars): {chave_final}")
        
        return chave_final
    
    def criptografar_mensagem(self, dados, chave_cliente):
      """Criptografa mensagem - EXATAMENTE IGUAL AO conn.py"""
      try:
        print("🔐 CRIPTOGRAFIA (padrão conn.py):")
        
        # 1. JSON exatamente igual
        json_data = json.dumps(dados, separators=(',', ':'))
        json_bytes = json_data.encode('utf-8')
        
        print(f"📄 JSON bytes: {len(json_bytes)}")
        print(f"📝 Checksum input: {hashlib.sha256(json_bytes).digest()[:4].hex()}")
        
        # 2. Chave de criptografia
        chave_cripto = hashlib.sha256(chave_cliente.encode()).digest()
        
        # 3. Criptografar APENAS os dados
        criptografado = bytearray()
        for i in range(len(json_bytes)):
            byte_chave = chave_cripto[i % len(chave_cripto)]
            criptografado.append(json_bytes[i] ^ byte_chave)
        
        # 4. Adicionar checksum NO FINAL
        checksum = hashlib.sha256(json_bytes).digest()[:4]
        criptografado.extend(checksum)
        
        # 5. Base64
        resultado = base64.b64encode(criptografado).decode('utf-8')
        
        print(f"✅ Criptografia OK:")
        print(f"   Dados criptografados: {len(criptografado) - 4} bytes")
        print(f"   Checksum anexado: {checksum.hex()} (+4 bytes)")
        print(f"   Total: {len(criptografado)} bytes")
        print(f"   Base64: {len(resultado)} chars")
        
        return resultado
        
      except Exception as e:
        print(f"❌ Erro: {e}")
        raise
    
    def fazer_handshake(self, ip_cliente):
        """Faz handshake com o servidor"""
        print(f"\n🤝 Tentando handshake com IP: {ip_cliente}")
        
        # Tentar com datas diferentes
        datas_tentativas = [
            datetime.now().strftime(self.DATE_FORMAT),
            (datetime.now() - timedelta(days=1)).strftime(self.DATE_FORMAT),
            (datetime.now() + timedelta(days=1)).strftime(self.DATE_FORMAT),
        ]
        
        for data_str in datas_tentativas:
            try:
                chave = self.gerar_chave_cliente(ip_cliente, data_str)
                
                dados = {"client_key": chave}
                headers = {"Content-Type": "application/json"}
                
                print(f"📤 Tentando com data {data_str}...")
                
                response = requests.post(
                    f"{self.SERVER_URL}/handshake",
                    json=dados,
                    headers=headers,
                    timeout=self.TIMEOUT,
                    verify=False
                )
                
                print(f"📥 Resposta: {response.status_code}")
                
                if response.status_code == 200:
                    resultado = response.json()
                    print(f"✅ Handshake bem-sucedido!")
                    print(f"🔐 Token: {resultado['token'][:30]}...")
                    print(f"🆔 Client ID: {resultado.get('client_id')}")
                    return resultado['token']
                elif response.status_code == 401:
                    print(f"❌ Data {data_str} não autorizada")
                    continue
                else:
                    print(f"⚠️  Erro {response.status_code}: {response.text[:200]}")
                    
            except Exception as e:
                print(f"❌ Erro: {type(e).__name__}: {e}")
                continue
        
        print("❌ Todas as tentativas de handshake falharam")
        return None
        
        
    
    def enviar_mensagem(self, telefone, mensagem):
      """Envia mensagem WhatsApp"""
      time.sleep(60)
      try:
        print(f"\n📤 Enviando WhatsApp para: {telefone}")
        print("=" * 60)
        
        # 1. Obter IP
        ip = self.get_public_ip()
        
        # 2. Fazer handshake
        token = self.fazer_handshake(ip)
        if not token:
            return False
        
        # 3. Gerar chave para criptografia
        chave = self.gerar_chave_cliente(ip)
        
        # 4. Preparar dados
        dados_mensagem = {
            "numero": str(telefone).strip(),
            "mensagem": mensagem
        }
        
        print(f"📝 Mensagem ({len(mensagem)} chars): {mensagem[:80]}...")
        
        # 5. Criptografar - USE A NOVA VERSÃO
        mensagem_cripto = self.criptografar_mensagem(dados_mensagem, chave)
        
        # 6. Enviar
        dados_envio = {"encrypted_message": mensagem_cripto}
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}"
        }
        
        print(f"🚀 Enviando para {self.SERVER_URL}/send...")
        
        response = requests.post(
            f"{self.SERVER_URL}/send",
            json=dados_envio,
            headers=headers,
            timeout=self.TIMEOUT,
            verify=False
        )
        
        print(f"⏱️  Status: {response.status_code}")
        
        if response.status_code == 200:
            resultado = response.json()
            print(f"\n✅ Mensagem enviada com sucesso!")
            print(f"📨 Message ID: {resultado.get('message_id')}")
            return True
        else:
            print(f"\n❌ Erro {response.status_code}: {response.text}")
            
            # Diagnóstico detalhado
            if response.status_code == 400:
                print("\n🔍 DIAGNÓSTICO DO ERRO 400:")
                print("   Possível problema na ordem checksum/dados")
                print("   Teste a criptografia localmente:")
                print("   python wp_controller.py testar_cripto")
                
            return False
            
      except Exception as e:
        print(f"\n💥 Erro crítico: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    def formatar_mensagem_escala(self, membro, escala, ministro, music_key, mensal=False):
        """Formata mensagem de escala - BUSCA MÚSICAS DO BANCO"""
        # Dados básicos
        data_str = escala.date.strftime('%d/%m/%Y')
        nome_membro = membro.get('name', '').strip()
        funcao = membro.get('role', 'Participante').strip()
        nome_lider = ministro.name.strip() if ministro else "Líder"
        
        # Título
        titulo = f"💜 *Adorefy* - *{escala.event}*\n🚨 *Você foi escalado!!* 🚨" if mensal else "💜 *Adorefy*\n🚨 *Você foi escalado!!* 🚨"
        
        # Buscar informações completas das músicas
        musicas_info = self._buscar_musicas_escala(escala)

        # Construir mensagem
        obs = "..."

         # Observação
        if escala.description and escala.description.strip():
            obs = escala.description.strip()
            if len(obs) > 60:
                obs = obs[:57] + "..."

        msg = f"""{titulo}

🎵 *Membro:* {nome_membro}
📅 *Data:* {data_str}
🕐 *Horário:* {escala.time}
⛪ *Evento:* {obs}
🎶 *Função:* {funcao}
👑 *Líder:* {nome_lider}"""

        if musicas_info:
            msg += "\n\n🎸 *REPERTÓRIO* 🎸"
            
            # Verificar se todas as músicas têm o mesmo tom
            todos_tons = [key for _, _, _, key in musicas_info if key]
            tom_unico = None
            if todos_tons:
                tom_unico = todos_tons[0] if all(t == todos_tons[0] for t in todos_tons) else None
            
            for i, (titulo_musica, artista, chords, tom_musica) in enumerate(musicas_info[:5], 1):
                # Linha 1: Número e título
                msg += f"\n\n{i}. *{titulo_musica}*"
                
                # Linha 2: Artista
                msg += f"\n   👤 {artista}"
                
                # Linha 3: Tom (se tiver)
                if tom_musica:
                    msg += f"\n   🎹 *Tom:* {tom_musica}"
                
                # Linha 4: Cifra (se tiver)
                if chords:
                    msg += f"\n   🔗 *Cifra:* {chords}"
                
                # Linha 5: Link para letra no Adorefy (NOVO)
                adorefy_link = os.getenv('APP_PUBLIC_URL', '') or 'https://seu-dominio.com/'
                msg += f"\n   📝 *Letra:* [Disponível no App Adorefy]({adorefy_link})"
            
            if len(musicas_info) > 5:
                msg += f"\n\n📚 *+{len(musicas_info) - 5} música(s)*"
            
            # Resumo dos tons
            musicas_com_tom = sum(1 for _, _, _, key in musicas_info if key)
            if musicas_com_tom > 0:
                if tom_unico:
                    msg += f"\n\n✅ *Tom único:* {tom_unico}"
                else:
                    tons_diferentes = len(set([key for _, _, _, key in musicas_info if key]))
                    msg += f"\n\n🎹 *{tons_diferentes} tom(s) diferente(s)*"
            
            musicas_sem_tom = len(musicas_info) - musicas_com_tom
            if musicas_sem_tom > 0:
                msg += f"\n⚠️ {musicas_sem_tom} música(s) sem tom definido"
            
            # Dica final
            msg += f"\n\n🎯 *DICA:* Estude com antecedência!"

        # Tom geral (fallback)
        elif hasattr(escala, 'music_key') and escala.music_key:
            msg += f"\n\n🎹 *Tom principal:* {escala.music_key}"
        

        # Contato do líder
        telefone_lider = getattr(ministro, 'phone', '').strip()
        if telefone_lider:
            tel_formatado = self._formatar_telefone(telefone_lider)
            msg += f"\n\n📱 *Contato do Líder:* {tel_formatado}"
        
        # Rodapé
        msg += "\n\n✅ *Confirme sua presença com o líder*"
        msg += "\n\n💡 *Desenvolvido por Mike*"
        
        return msg

    def _buscar_musicas_escala(self, escala):
        """Busca informações completas das músicas no banco"""
        try:
            from models import Song 
            
            songs_data = escala.get_songs()
            print("Musicas da escala aqui", songs_data)
            if not songs_data:
                return []
            
            musicas_completas = []
            
            for item in songs_data:
                # Inicializar variáveis
                song_id = None
                key = None
                
                if isinstance(item, dict):
                    song_id = item.get('id')
                    key = item.get('key')  # Extrai a key do dicionário
                elif isinstance(item, (int, str)):
                    try:
                        song_id = int(item)
                        # Para itens que são apenas int/str, key pode ser None ou um valor padrão
                        key = None
                    except:
                        song_id = None
                        key = None
                else:
                    continue
                
                if song_id:
                    # Buscar música no banco
                    song = Song.query.get(song_id)
                    if song:
                        titulo  = song.title.strip() if song.title else f"Música {song_id}"
                        artista = song.artist.strip() if song.artist else "Artista não informado"
                        chords  = song.chords.strip() if song.chords else "Link não encontrado"
                        
                        # Se key não foi extraída do item, tenta pegar do song se existir
                        if key is None and hasattr(song, 'key'):
                            key = song.key
                        
                        musicas_completas.append((titulo, artista, chords, key))
                    else:
                        # Se não encontrou no banco, usar dados básicos do item
                        if isinstance(item, dict):
                            titulo  = item.get('title', f"Música {song_id}")
                            artista = item.get('artist', 'Artista não informado')
                            chords  = item.get('chords', 'Link não encontrado')
                            # Usa a key extraída do item ou um valor padrão
                            key = key or item.get('key', 'Não especificada')
                            
                            musicas_completas.append((
                                str(titulo).strip(), 
                                str(artista).strip(), 
                                str(chords).strip(),
                                str(key).strip() if key else 'Não especificada'
                            ))
            
            return musicas_completas
            
        except Exception as e:
            print(f"⚠️ Erro ao buscar músicas: {e}")
            return []

    def _formatar_telefone(self, telefone):
       """Formata telefone brasileiro"""
       tel = str(telefone).strip()
    
       if tel.startswith('55') and len(tel) >= 12:
          ddd = tel[2:4]
          numero = tel[4:]
        
          if len(numero) == 9:  # Celular: (41) 99999-9999
            return f"({ddd}) {numero[:5]}-{numero[5:]}"
          elif len(numero) == 8:  # Fixo: (41) 3333-4444
              return f"({ddd}) {numero[:4]}-{numero[4:]}"
    
       return tel  # Retorna como está se não conseguir formatar
    
    def enviar_para_membro(self, membro_info, escala, ministro, mensal=False):
        """Envia mensagem para um membro específico"""
        try:
            nome = membro_info.get('name', 'Membro')
            telefone = membro_info.get('phone')
            
            if not telefone:
                print(f"⚠️  Sem telefone para {nome}")
                return False
            
            print(f"\n👤 Processando {nome}...")
            
            # Formatar telefone
            tel_formatado = str(telefone).strip()
            if not tel_formatado.startswith('55'):
                tel_formatado = f"55{tel_formatado}"
            
            # Formatar mensagem
            mensagem = self.formatar_mensagem_escala(membro_info, escala, ministro, mensal)
            
            # Enviar
            return self.enviar_mensagem(tel_formatado, mensagem)
            
        except Exception as e:
            print(f"❌ Erro ao enviar para membro: {e}")
            return False

    def testar_conexao_completa(self):
        """Teste completo da conexão"""
        print("\n" + "=" * 70)
        print("🔧 TESTE COMPLETO DO WHATSAPP CONTROLLER")
        print("=" * 70)
        
        print("\n1. 🔍 Verificando configuração...")
        print(f"   Servidor: {self.SERVER_URL}")
        print(f"   Master Key: {self.MASTER_KEY[:15]}...")
        
        if "CHANGE_THIS" in self.MASTER_KEY:
            print("   ⚠️  ALERTA: Master Key padrão detectada!")
        
        print("\n2. 🌐 Obtendo IP público...")
        ip = self.get_public_ip()
        
        print("\n3. 🤝 Tentando handshake...")
        token = self.fazer_handshake(ip)
        
        if not token:
            print("❌ TESTE FALHOU: Handshake não realizado")
            return False
        
        print("\n4. 🔐 Testando criptografia...")
        try:
            chave = self.gerar_chave_cliente(ip)
            dados_teste = {"numero": "55123456789", "mensagem": "Teste de criptografia"}
            cripto = self.criptografar_mensagem(dados_teste, chave)
            print(f"   ✅ Criptografia OK: {len(cripto)} chars")
        except Exception as e:
            print(f"   ❌ Criptografia falhou: {e}")
            return False
        
        print("\n5. 📡 Testando endpoint /health...")
        try:
            response = requests.get(f"{self.SERVER_URL}/health", timeout=10, verify=False)
            print(f"   Health check: Status {response.status_code}")
            if response.status_code == 200:
                print(f"   ✅ Servidor saudável")
            else:
                print(f"   ⚠️  Servidor pode ter problemas")
        except Exception as e:
            print(f"   ❌ Não foi possível acessar /health: {e}")
        
        print("\n" + "=" * 70)
        print("✅ TESTE DE CONEXÃO CONCLUÍDO")
        print("=" * 70)
        
        return True

    def enviar_mensagem_direta(self, telefone, mensagem):
        """Envia mensagem diretamente (usado pela fila)"""
        try:
            print(f"📤 Enviando diretamente para: {telefone}")
            
            # Obter IP
            ip = self.get_public_ip()
            
            # Fazer handshake
            token = self.fazer_handshake(ip)
            if not token:
                print("❌ Falha no handshake")
                return False
            
            # Gerar chave
            chave = self.gerar_chave_cliente(ip)
            
            # Preparar dados
            dados_mensagem = {
                "numero": str(telefone).strip(),
                "mensagem": mensagem
            }
            
            print(f"📝 Mensagem: {len(mensagem)} chars")
            
            # Criptografar
            mensagem_cripto = self.criptografar_mensagem(dados_mensagem, chave)
            
            # Enviar
            dados_envio = {"encrypted_message": mensagem_cripto}
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {token}"
            }
            
            response = requests.post(
                f"{self.SERVER_URL}/send",
                json=dados_envio,
                headers=headers,
                timeout=self.TIMEOUT,
                verify=False
            )
            
            if response.status_code == 200:
                print("✅ Mensagem enviada com sucesso")
                return True
            else:
                print(f"❌ Erro {response.status_code}: {response.text[:100]}")
                return False
                
        except Exception as e:
            print(f"💥 Erro no envio direto: {e}")
            return False
    
    def enviar_mensagem_via_fila(self, telefone, mensagem, escala_id=None, membro_id=None):
        """Adiciona mensagem à fila (método principal para uso externo)"""
        print(f"📥 Adicionando à fila: {telefone}")
        
        # Formatar telefone
        tel_formatado = str(telefone).strip()
        if not tel_formatado.startswith('55'):
            tel_formatado = f"55{tel_formatado}"
        
        # Adicionar à fila
        message_id = self.queue.add_message(
            phone=tel_formatado,
            message=mensagem,
            scale_id=escala_id,
            member_id=membro_id
        )
        
        if message_id:
            status = self.queue.get_status()
            tempo_estimado = status['estimated_time_remaining']
            
            # Converter segundos para formato legível
            if tempo_estimado < 60:
                tempo_str = f"{tempo_estimado} segundos"
            elif tempo_estimado < 3600:
                minutos = tempo_estimado // 60
                tempo_str = f"{minutos} minuto{'s' if minutos > 1 else ''}"
            else:
                horas = tempo_estimado // 3600
                minutos = (tempo_estimado % 3600) // 60
                tempo_str = f"{horas}h{minutos:02d}"
            
            return {
                'success': True,
                'message_id': message_id,
                'queue_position': status['pending'],
                'estimated_time': tempo_str,
                'queue_status': 'pending'
            }
        else:
            return {'success': False, 'error': 'Falha ao adicionar à fila'}
    
    def enviar_para_membro_via_fila(self, membro_info, escala, ministro, music_key, mensal=False):
        """Envia mensagem para um membro via fila"""
        try:
            nome = membro_info.get('name', 'Membro')
            telefone = membro_info.get('phone')
            
            if not telefone:
                print(f"⚠️  Sem telefone para {nome}")
                return {'success': False, 'error': 'Sem telefone'}
            
            print(f"\n👤 Processando {nome} (via fila)...")
            
            # Formatar mensagem
            mensagem = self.formatar_mensagem_escala(membro_info, escala, ministro, music_key, mensal)
            
            # Enviar via fila
            return self.enviar_mensagem_via_fila(
                telefone=telefone,
                mensagem=mensagem,
                escala_id=escala.id if hasattr(escala, 'id') else None,
                membro_id=membro_info.get('id')
            )
            
        except Exception as e:
            print(f"❌ Erro ao enviar para membro: {e}")
            return {'success': False, 'error': str(e)}
    
    def enviar_para_multiplos_membros(self, membros_info, escala, ministro, mensal=False):
        """Envia mensagens para múltiplos membros de uma vez"""
        music_key = "Null"
        resultados = []
        
        print(f"\n👥 Enviando para {len(membros_info)} membros via fila...")
        
        for membro in membros_info:
            resultado = self.enviar_para_membro_via_fila(membro, escala, ministro, music_key, mensal)
            resultados.append({
                'member_id': membro.get('id'),
                'member_name': membro.get('name'),
                'result': resultado
            })
            
            # Pequena pausa entre adições à fila
            time.sleep(0.1)
        
        # Resumo
        sucessos = sum(1 for r in resultados if r['result'].get('success'))
        falhas = len(resultados) - sucessos
        
        print(f"\n📊 RESUMO DO ENVIO:")
        print(f"   ✅ Sucessos: {sucessos}")
        print(f"   ❌ Falhas: {falhas}")
        print(f"   ⏳ Na fila: {self.queue.stats['queue_size']}")
        
        return {
            'success': True,
            'total_members': len(membros_info),
            'successful': sucessos,
            'failed': falhas,
            'queue_status': self.queue.get_status(),
            'details': resultados
        }
    
    def get_queue_status(self):
        """Retorna status da fila"""
        return self.queue.get_status()
    
    def controlar_fila(self, acao):
        """Controla a fila (iniciar, pausar, parar, limpar)"""
        if acao == 'start':
            self.queue.start_processing()
            return {'success': True, 'message': 'Fila iniciada'}
        elif acao == 'pause':
            self.queue.pause()
            return {'success': True, 'message': 'Fila pausada'}
        elif acao == 'resume':
            self.queue.resume()
            return {'success': True, 'message': 'Fila retomada'}
        elif acao == 'stop':
            self.queue.stop()
            return {'success': True, 'message': 'Fila parada'}
        elif acao == 'clear':
            self.queue.clear_queue()
            return {'success': True, 'message': 'Fila limpa'}
        else:
            return {'success': False, 'error': f'Ação desconhecida: {acao}'}    

# Instância global
whatsapp_controller = WhatsAppController()

# Funções auxiliares
def testar_rapido():
    """Teste rápido"""
    wp = WhatsAppController()
    
    print("🧪 TESTE RÁPIDO DE CONEXÃO")
    print("=" * 50)
    
    # Teste 1: IP
    ip = wp.get_public_ip()
    print(f"IP: {ip}")
    
    # Teste 2: Chave
    chave = wp.gerar_chave_cliente(ip)
    print(f"Chave: {chave[:50]}...")
    
    # Teste 3: Handshake
    token = wp.fazer_handshake(ip)
    if token:
        print(f"✅ Sucesso! Token: {token[:20]}...")
        return True
    else:
        print("❌ Falha no handshake")
        return False

def gerar_comando_curl():
    """Gera comando curl para teste manual"""
    wp = WhatsAppController()
    ip = wp.get_public_ip()
    chave = wp.gerar_chave_cliente(ip)
    
    print("\n🌀 COMANDO CURL PARA TESTE MANUAL")
    print("=" * 60)
    print(f"IP: {ip}")
    print(f"Chave: {chave}")
    print()
    print("Para handshake:")
    print(f"curl -X POST '{wp.SERVER_URL}/handshake' \\")
    print(f"     -H 'Content-Type: application/json' \\")
    print(f"     -d '{{\"client_key\": \"{chave}\"}}' \\")
    print(f"     -k -v")
    print()
    print("Para testar conexão:")
    print(f"curl '{wp.SERVER_URL}/health' -k")
    print(f"curl '{wp.SERVER_URL}/status' -k")

if __name__ == "__main__":
    import sys
    
    print("\n📱 WHATSAPP CONTROLLER - ADOREFY")
    print("=" * 50)
    
    if len(sys.argv) > 1:
        comando = sys.argv[1].lower()
        
        if comando == "teste":
            wp = WhatsAppController()
            wp.testar_conexao_completa()
        elif comando == "rapido":
            testar_rapido()
        elif comando == "curl":
            gerar_comando_curl()
        elif comando == "ip":
            wp = WhatsAppController()
            print(f"IP: {wp.get_public_ip()}")
        elif comando == "chave":
            wp = WhatsAppController()
            ip = wp.get_public_ip()
            chave = wp.gerar_chave_cliente(ip)
            print(f"Chave para {ip}:")
            print(chave)
        elif comando == "handshake":
            wp = WhatsAppController()
            ip = wp.get_public_ip()
            wp.fazer_handshake(ip)
        else:
            print("Comandos disponíveis:")
            print("  teste      - Teste completo")
            print("  rapido     - Teste rápido")
            print("  curl       - Gerar comandos curl")
            print("  ip         - Mostrar IP")
            print("  chave      - Gerar chave")
            print("  handshake  - Testar handshake")
    else:
        # Modo interativo
        wp = WhatsAppController()
        
        print("\nSelecione uma opção:")
        print("1. Teste completo")
        print("2. Teste rápido")
        print("3. Gerar comandos curl")
        print("4. Sair")
        
        try:
            opcao = input("\nOpção: ").strip()
            
            if opcao == "1":
                wp.testar_conexao_completa()
            elif opcao == "2":
                testar_rapido()
            elif opcao == "3":
                gerar_comando_curl()
            else:
                print("Saindo...")
        except KeyboardInterrupt:
            print("\nInterrompido pelo usuário")
