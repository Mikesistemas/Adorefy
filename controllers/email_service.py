import threading
import os
import smtplib
import io
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
import logging
from datetime import datetime
from models import User, Ministry, Scale
import json

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmailService:
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(EmailService, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self.email_config = {
            'smtp_server': os.getenv('SMTP_SERVER', ''),
            'smtp_port': int(os.getenv('SMTP_PORT', 587)),
            'sender_email': os.getenv('EMAIL_SENDER', ''),
            'sender_password': os.getenv('EMAIL_PASSWORD', ''),
            'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
        }
        
        # Thread pool para envio assíncrono
        self.thread_pool = []
        self.max_threads = 5
        
        logger.info("✅ EmailService inicializado")
    
    def send_test_email(self, recipient_email=None):
        """Envia e-mail de teste quando a aplicação inicia"""
        print("🔄 Iniciando teste de envio de e-mail...")
        logger.info("Enviando e-mail de teste para a inicialização da aplicação")
        
        try:
            recipient_email = recipient_email or os.getenv('EMAIL_TEST_RECIPIENT', '')
            if not all([self.email_config['smtp_server'], self.email_config['sender_email'], self.email_config['sender_password'], recipient_email]):
                logger.warning("Configuração de e-mail incompleta. Verifique SMTP_SERVER, EMAIL_SENDER, EMAIL_PASSWORD e EMAIL_TEST_RECIPIENT no .env")
                return False

            msg = MIMEMultipart('related')
            msg['From'] = self.email_config['sender_email']
            msg['To'] = recipient_email
            msg['Subject'] = '🚀 Aplicação de Escalas Iniciada com Sucesso!'
            
            # Corpo do e-mail
            html = f"""
            <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                                padding: 30px; border-radius: 10px; color: white; text-align: center; margin-bottom: 20px;">
                        <h1 style="margin: 0; font-size: 28px;">🚀 Sistema de Escalas</h1>
                        <p style="margin: 10px 0 0; opacity: 0.9;">Inicialização Concluída</p>
                    </div>
                    
                    <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                        <h2 style="color: #2c3e50; margin-top: 0;">✅ Aplicação Iniciada com Sucesso!</h2>
                        <p>O sistema de gerenciamento de escalas está online e pronto para uso.</p>
                        
                        <div style="margin: 25px 0;">
                            <h3 style="color: #2c3e50;">📊 Informações do Sistema:</h3>
                            <ul style="list-style: none; padding: 0;">
                                <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
                                    <strong>Data/Hora:</strong> {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
                                    <strong>Status:</strong> <span style="color: #28a745;">● Online</span>
                                </li>
                                <li style="padding: 8px 0; border-bottom: 1px solid #eee;">
                                    <strong>Serviço de E-mail:</strong> <span style="color: #28a745;">● Ativo</span>
                                </li>
                            </ul>
                        </div>
                        
                        <div style="background-color: #e8f4fd; padding: 15px; border-radius: 5px; margin-top: 20px;">
                            <h4 style="color: #2c3e50; margin-top: 0;">📋 Próximos Passos:</h4>
                            <ul style="margin-bottom: 0;">
                                <li>Configure os ministérios no sistema</li>
                                <li>Adicione membros às equipes</li>
                                <li>Crie sua primeira escala</li>
                            </ul>
                        </div>
                    </div>
                    
                    <div style="text-align: center; color: #666; font-size: 0.9em; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                        <p>Este é um e-mail automático de notificação do sistema.</p>
                        <p>© {datetime.now().year} - Sistema de Gestão de Escalas</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            msg_html = MIMEText(html, 'html')
            msg.attach(msg_html)
            
            # Enviar e-mail
            with smtplib.SMTP(self.email_config['smtp_server'], self.email_config['smtp_port']) as server:
                if self.email_config['use_tls']:
                    server.starttls()
                server.login(self.email_config['sender_email'], self.email_config['sender_password'])
                server.send_message(msg)
            
            print(f"✅ E-mail de teste enviado para {recipient_email}")
            logger.info(f"E-mail de teste enviado com sucesso para {recipient_email}")
            return True
            
        except Exception as e:
            print(f"❌ Erro ao enviar e-mail de teste: {str(e)}")
            logger.error(f"Erro no envio de e-mail de teste: {str(e)}")
            return False
    
    def generate_scale_table_image(self, scales, ministry, members_data):
        """Gera imagem da tabela de escalas"""
        print(f"🖼️ Gerando imagem da tabela para {len(scales)} escalas...")
        logger.info(f"Gerando imagem da tabela para ministério {ministry.name}")
        
        try:
            # Preparar dados
            data = []
            headers = ['Data', 'Dia']
            
            # Coletar todas as funções únicas
            all_functions = []
            for scale in scales:
                members = scale.get_members()
                for member in members:
                    role = member.get('role', 'Participante')
                    if role and role not in all_functions:
                        all_functions.append(role)
            
            # Adicionar colunas de funções
            headers.extend(all_functions)
            headers.append('Descrição')
            
            # Preencher dados
            for scale in scales:
                row = []
                
                # Data
                scale_date = scale.date
                if not isinstance(scale_date, datetime):
                    scale_date = datetime.combine(scale_date, datetime.min.time())
                
                row.append(scale_date.strftime('%d/%m'))
                row.append(scale_date.strftime('%a')[:3])
                
                # Mapear membros por função
                members = scale.get_members()
                member_by_role = {}
                for member in members:
                    role = member.get('role', 'Participante')
                    user = User.query.get(member.get('id'))
                    if user:
                        member_by_role[role] = user.name
                
                # Preencher células de função
                for function in all_functions:
                    row.append(member_by_role.get(function, '-'))
                
                # Descrição
                row.append(scale.description[:20] + '...' if scale.description and len(scale.description) > 20 else (scale.description or '-'))
                
                data.append(row)
            
            # Criar figura
            fig_width = max(12, len(headers) * 2)
            fig_height = 6 + len(scales) * 0.5
            
            fig, ax = plt.subplots(figsize=(fig_width, fig_height))
            ax.axis('tight')
            ax.axis('off')
            
            # Criar tabela
            table_data = [headers] + data
            table = ax.table(cellText=table_data, cellLoc='center', loc='center')
            
            # Estilizar
            table.auto_set_font_size(False)
            table.set_fontsize(9)
            table.scale(1, 1.8)
            
            # Colorir cabeçalho
            for i in range(len(headers)):
                cell = table[(0, i)]
                cell.set_facecolor('#2c3e50')
                cell.set_text_props(weight='bold', color='white')
            
            # Alternar cores das linhas
            for i in range(1, len(data) + 1):
                row_color = '#ffffff' if i % 2 == 1 else '#f8f9fa'
                for j in range(len(headers)):
                    cell = table[(i, j)]
                    cell.set_facecolor(row_color)
            
            # Título
            month_ref = getattr(scales[0], 'month_reference', None)
            if month_ref:
                if isinstance(month_ref, str):
                    title_date = month_ref
                else:
                    title_date = month_ref.strftime('%B/%Y') if hasattr(month_ref, 'strftime') else str(month_ref)
            else:
                title_date = scales[0].date.strftime('%B/%Y') if len(scales) > 0 else ''
            
            plt.title(f'Escala - {ministry.name} ({title_date})', 
                     fontsize=14, fontweight='bold', pad=20, color='#2c3e50')
            
            # Rodapé
            plt.figtext(0.5, 0.01, 
                       f'Gerado em {datetime.now().strftime("%d/%m/%Y %H:%M")} • Sistema de Escalas', 
                       ha='center', fontsize=8, style='italic', color='#666')
            
            # Salvar em buffer
            img_buffer = io.BytesIO()
            plt.savefig(img_buffer, format='png', dpi=150, bbox_inches='tight', 
                       facecolor='white', edgecolor='none')
            plt.close(fig)
            img_buffer.seek(0)
            
            print(f"✅ Imagem gerada: {len(img_buffer.getvalue())} bytes")
            logger.info("Imagem da tabela gerada com sucesso")
            
            return img_buffer.getvalue()
            
        except Exception as e:
            print(f"❌ Erro ao gerar imagem: {str(e)}")
            logger.error(f"Erro ao gerar imagem da tabela: {str(e)}")
            return None
    
    def _send_single_email(self, recipient_email, recipient_name, scales, ministry, img_data, role):
        """Função interna para envio de e-mail individual (executada em thread)"""
        thread_name = threading.current_thread().name
        print(f"📧 [{thread_name}] Preparando e-mail para {recipient_email}")
        
        try:
            recipient_email = recipient_email or os.getenv('EMAIL_TEST_RECIPIENT', '')
            if not all([self.email_config['smtp_server'], self.email_config['sender_email'], self.email_config['sender_password'], recipient_email]):
                logger.warning("Configuração de e-mail incompleta. Verifique SMTP_SERVER, EMAIL_SENDER, EMAIL_PASSWORD e EMAIL_TEST_RECIPIENT no .env")
                return False

            msg = MIMEMultipart('related')
            msg['From'] = self.email_config['sender_email']
            msg['To'] = recipient_email
            
            # Determinar título baseado no tipo
            if len(scales) > 1:
                msg['Subject'] = f'📅 Escala Mensal - {ministry.name}'
                scale_type = "mensal"
                period_info = getattr(scales[0], 'month_reference', scales[0].date.strftime('%B/%Y'))
            else:
                msg['Subject'] = f'📅 Escala - {ministry.name}'
                scale_type = "única"
                period_info = scales[0].date.strftime('%d/%m/%Y')
            
            # Template HTML
            html = f"""
            <html>
            <body style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 650px; margin: 0 auto; padding: 20px;">
                    <!-- Cabeçalho -->
                    <div style="background: linear-gradient(135deg, #3498db 0%, #2c3e50 100%); 
                                padding: 30px; border-radius: 10px 10px 0 0; color: white; text-align: center;">
                        <h1 style="margin: 0; font-size: 26px;">🎵 Ministério {ministry.name}</h1>
                        <p style="margin: 10px 0 0; opacity: 0.9; font-size: 16px;">Escala {scale_type}</p>
                    </div>
                    
                    <!-- Conteúdo -->
                    <div style="background-color: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; 
                                border: 1px solid #e0e0e0; border-top: none;">
                        <h2 style="color: #2c3e50; margin-top: 0;">Olá, {recipient_name}!</h2>
                        <p style="font-size: 16px;">Você foi escalado(a) para o ministério <strong>{ministry.name}</strong>.</p>
                        
                        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <p style="margin: 0; color: #2c3e50;"><strong>📋 Informações da Escala:</strong></p>
                            <ul style="margin: 10px 0 0 20px; color: #555;">
                                <li><strong>Tipo:</strong> Escala {scale_type}</li>
                                <li><strong>Período:</strong> {period_info}</li>
                                <li><strong>Sua Função:</strong> {role}</li>
                            </ul>
                        </div>
                        
                        <!-- Tabela como imagem -->
                        <div style="margin: 30px 0; text-align: center;">
                            <p style="font-weight: bold; color: #2c3e50; margin-bottom: 15px;">👇 Sua escala está na imagem abaixo:</p>
                            <div style="display: inline-block; padding: 10px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #ddd;">
                                <img src="cid:scale_table" alt="Tabela de Escala" 
                                     style="max-width: 100%; height: auto; border-radius: 4px;" />
                            </div>
                        </div>
                        
                        <!-- Instruções -->
                        <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin-top: 25px;">
                            <h4 style="color: #2c3e50; margin-top: 0;">🎯 Ações Necessárias:</h4>
                            <ul style="margin-bottom: 0;">
                                <li><strong>Confirmar Presença:</strong> Acesse o sistema para confirmar sua participação</li>
                                <li><strong>Preparo:</strong> Chegue com 30 minutos de antecedência</li>
                                <li><strong>Impedimentos:</strong> Em caso de impossibilidade, avise com antecedência</li>
                                <li><strong>Repertório:</strong> Estude as músicas previamente</li>
                            </ul>
                        </div>
                    </div>
                    
                    <!-- Rodapé -->
                    <div style="text-align: center; color: #666; font-size: 0.8em; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                        <p style="margin: 0;">Este é um e-mail automático do sistema de gestão de escalas.</p>
                        <p style="margin: 5px 0;">Para dúvidas, entre em contato com o líder do ministério.</p>
                        <p style="margin: 10px 0; color: #999;">© {datetime.now().year} - Sistema de Escalas</p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            msg_html = MIMEText(html, 'html')
            msg.attach(msg_html)
            
            # Anexar imagem
            if img_data:
                img = MIMEImage(img_data)
                img.add_header('Content-ID', '<scale_table>')
                img.add_header('Content-Disposition', 'inline', filename=f'escala_{ministry.name}.png')
                msg.attach(img)
            
            # Enviar
            with smtplib.SMTP(self.email_config['smtp_server'], self.email_config['smtp_port']) as server:
                if self.email_config['use_tls']:
                    server.starttls()
                server.login(self.email_config['sender_email'], self.email_config['sender_password'])
                server.send_message(msg)
            
            print(f"✅ [{thread_name}] E-mail enviado para {recipient_email}")
            logger.info(f"E-mail enviado para {recipient_email}")
            
        except Exception as e:
            print(f"❌ [{thread_name}] Erro ao enviar e-mail para {recipient_email}: {str(e)}")
            logger.error(f"Erro ao enviar e-mail para {recipient_email}: {str(e)}")
            raise
    
    def send_scale_emails(self, scale, members_data, is_monthly=False):
        """Envia e-mails de escala usando threads"""
        print("="*60)
        print("🚀 INICIANDO ENVIO DE E-MAILS DE ESCALA")
        print("="*60)
        
        try:
            ministry = Ministry.query.get(scale.ministry_id)
            if not ministry:
                print("❌ Ministério não encontrado")
                return 0
            
            # Buscar escalas do grupo se for mensal
            if is_monthly and scale.scale_group:
                scales = Scale.query.filter(
                    Scale.scale_group == scale.scale_group
                ).order_by(Scale.date).all()
                print(f"📅 Encontradas {len(scales)} escalas no grupo mensal")
            else:
                scales = [scale]
            
            # Gerar imagem da tabela
            img_data = self.generate_scale_table_image(scales, ministry, members_data)
            if not img_data:
                print("❌ Falha ao gerar imagem da tabela")
                return 0
            
            # Preparar destinatários
            recipients = []
            
            # Adicionar membros escalados
            for member in members_data:
                member_id = member.get('id')
                user = User.query.get(member_id)
                if user and user.email:
                    recipients.append({
                        'email': user.email,
                        'name': user.name,
                        'role': member.get('role', 'Participante')
                    })
            
            # Adicionar líder do ministério
            if ministry.leader_id:
                leader = User.query.get(ministry.leader_id)
                if leader and leader.email:
                    recipients.append({
                        'email': leader.email,
                        'name': leader.name,
                        'role': 'Líder do Ministério'
                    })
            
            # Adicionar líderes adicionais se existirem
            if hasattr(ministry, 'additional_leaders') and ministry.additional_leaders:
                try:
                    additional_leader_ids = json.loads(ministry.additional_leaders)
                    for leader_id in additional_leader_ids:
                        leader = User.query.get(leader_id)
                        if leader and leader.email:
                            recipients.append({
                                'email': leader.email,
                                'name': leader.name,
                                'role': 'Líder do Ministério'
                            })
                except:
                    pass
            
            if not recipients:
                print("⚠️ Nenhum destinatário encontrado com e-mail válido")
                return 0
            
            print(f"📧 {len(recipients)} destinatários encontrados")
            print(f"🔄 Iniciando envio com {self.max_threads} threads...")
            
            # Criar threads para envio
            threads = []
            emails_sent = 0
            
            for recipient in recipients:
                if len(threads) >= self.max_threads:
                    # Esperar algumas threads terminarem
                    for t in threads:
                        t.join(timeout=30)
                    threads = [t for t in threads if t.is_alive()]
                
                thread = threading.Thread(
                    target=self._send_single_email,
                    args=(recipient['email'], recipient['name'], scales, ministry, img_data, recipient['role']),
                    name=f"EmailThread-{emails_sent+1}",
                    daemon=True
                )
                
                thread.start()
                threads.append(thread)
                emails_sent += 1
                print(f"📤 [{emails_sent}] Thread iniciada para {recipient['email']}")
            
            # Aguardar todas as threads terminarem
            for thread in threads:
                thread.join(timeout=60)
            
            print("="*60)
            print(f"✅ ENVIO CONCLUÍDO: {emails_sent} e-mails processados")
            print("="*60)
            
            return emails_sent
            
        except Exception as e:
            print(f"❌ Erro no envio de e-mails: {str(e)}")
            logger.error(f"Erro no envio de e-mails: {str(e)}")
            import traceback
            traceback.print_exc()
            return 0

# Singleton global
email_service = EmailService()