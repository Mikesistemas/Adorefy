from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Scale, User, Ministry, Notification
from datetime import datetime, timedelta
import json
import uuid
import calendar
import threading
import smtplib
import io
from email.mime.image import MIMEImage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
from sqlalchemy import or_, and_
import os
import time
import atexit

# Importar o WhatsApp Controller
from controllers.wp_controller import whatsapp_controller

EMAIL_CONFIG = {
    'smtp_server': os.getenv('SMTP_SERVER', ''),
    'smtp_port': int(os.getenv('SMTP_PORT', 587)),
    'sender_email': os.getenv('EMAIL_SENDER', ''),
    'sender_password': os.getenv('EMAIL_PASSWORD', ''),
    'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
}


class ScaleController:
    
    def __init__(self):
        # Testar envio de e-mail ao iniciar
        return
        #self._test_email_on_startup()
    
    def _send_whatsapp_with_context(self, member_data_dict, scale_id, music_key, is_monthly):
      """Versão simplificada que usa a fila integrada"""
      try:
        print(f"\n🧵 Adicionando à fila: {member_data_dict.get('name')}")
        
        # Importar dentro da função
        from app import create_app
        
        # Criar contexto Flask
        app = create_app()
        
        with app.app_context():
            # Buscar dados
            scale = Scale.query.get(scale_id)
            if not scale:
                print(f"⚠️ Escala {scale_id} não encontrada")
                return {'success': False, 'error': 'Escala não encontrada'}
            
            member_id = member_data_dict.get('id')
            user = User.query.get(member_id) if member_id else None
            
            if not user:
                print(f"⚠️ Usuário {member_id} não encontrado")
                return {'success': False, 'error': 'Usuário não encontrado'}
            
            # Buscar líder
            ministry = Ministry.query.get(scale.ministry_id)
            minister = None
            if ministry and ministry.leader_id:
                minister = User.query.get(ministry.leader_id)
            
            if not minister and scale.created_by:
                minister = User.query.get(scale.created_by)
            
            # Preparar dados do membro
            membro_info = {
                'id': user.id,
                'name': user.name,
                'phone': user.phone,
                'role': member_data_dict.get('role', 'Participante')
            }
            
            # Usar o WhatsAppController com fila integrada
            from controllers.wp_controller import whatsapp_controller
            
            result = whatsapp_controller.enviar_para_membro_via_fila(
                membro_info=membro_info,
                escala=scale,
                ministro=minister,
                music_key=music_key,
                mensal=is_monthly
            )
            
            if result.get('success'):
                print(f"✅ Adicionado à fila: {user.name}")
                if 'estimated_time' in result:
                    print(f"   ⏰ Envio estimado: {result['estimated_time']}")
            else:
                print(f"❌ Falha: {user.name} - {result.get('error')}")
            
            return result
            
      except Exception as e:
        print(f"❌ Erro crítico: {e}")
        import traceback
        traceback.print_exc()
        return {'success': False, 'error': str(e)}

    def _test_email_on_startup(self):
        """Executa teste de e-mail quando o controller é inicializado"""
        print("\n" + "="*70)
        print("🎬 INICIANDO SISTEMA DE ESCALAS")
        print("="*70)
        
        # Aguardar um pouco para inicialização completa
        import time
        time.sleep(2)
        
        print("📧 TESTANDO SERVIÇO DE E-MAIL...")
        
        # Criar thread para teste de e-mail
        test_thread = threading.Thread(
            target=self._send_test_email,
            args=(os.getenv('EMAIL_TEST_RECIPIENT', ''),),
            name="StartupEmailTest",
            daemon=True
        )
        test_thread.start()
        
        print("✅ Teste de e-mail agendado em background")
        print("🎯 Sistema pronto para receber requisições")
        print("="*70 + "\n")

    @jwt_required()
    def get_all(self):
       try:
           current_user_id = get_jwt_identity()
           current_user = User.query.get(current_user_id)
           '''db.session.query(scales).delete()
           db.session.commit()'''
           if not current_user:
               return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
           
           user_permissions = current_user.get_permissions()
           permitted_ministries = current_user.get_permitted_ministries()
           
           has_escala_view = 'escala_view' in user_permissions or 'all' in user_permissions
           if not has_escala_view:
               return jsonify({
                   'success': False, 
                   'error': 'Você não tem permissão para visualizar escalas'
               }), 403
           
           if current_user.role == 'admin':
               scales = Scale.query.all()
           elif current_user.role == 'lider':
               led_ministries = Ministry.query.filter_by(leader_id=current_user_id).all()
               ministry_ids = [m.id for m in led_ministries]
               
               if ministry_ids:
                   scales = Scale.query.filter(Scale.ministry_id.in_(ministry_ids)).all()
               else:
                   scales = []
           else:
               if 'escala_view_all' in user_permissions:
                   allowed_ministries = permitted_ministries.get('escala_view_all', [])
                   if allowed_ministries:
                       scales = Scale.query.filter(Scale.ministry_id.in_(allowed_ministries)).all()
                   else:
                       scales = self._get_scales_where_member(current_user_id)
               else:
                   scales = self._get_scales_where_member(current_user_id)
           
           scales_data = []
           for scale in scales:
               try:
                   scales_data.append(scale.to_dict())
               except Exception as e:
                   print(f"Erro ao converter escala {scale.id}: {e}")
                   scales_data.append({
                       'id': scale.id,
                       'event': getattr(scale, 'event', 'Evento desconhecido'),
                       'date': getattr(scale, 'date', datetime.now()).isoformat(),
                       'time': getattr(scale, 'time', ''),
                       'ministry': getattr(scale, 'ministry_id', 0),
                       'description': getattr(scale, 'description', ''),
                       'status': getattr(scale, 'status', 'pending'),
                       'scale_type': getattr(scale, 'scale_type', 'single'),
                       'scale_group': getattr(scale, 'scale_group', None),
                       'month_reference': getattr(scale, 'month_reference', None),
                       'members': scale.get_members() if hasattr(scale, 'get_members') else [],
                       'songs': scale.get_songs() if hasattr(scale, 'get_songs') else [],
                       'observations': scale.get_observations() if hasattr(scale, 'get_observations') else []
                   })
           
           return jsonify({
               'success': True,
               'data': {
                   'scales': scales_data
               }
           })
           
       except Exception as e:
           print(f"Erro no ScaleController.get_all: {str(e)}")
           import traceback
           traceback.print_exc()
           return jsonify({'success': False, 'error': str(e)}), 500

    def _get_scales_where_member(self, user_id):
        all_scales = Scale.query.all()
        user_scales = []
        
        for scale in all_scales:
            try:
                scale_members = scale.get_members()
                if any(member.get('id') == user_id for member in scale_members):
                    user_scales.append(scale)
            except Exception as e:
                print(f"Erro ao processar escala {scale.id}: {e}")
                continue
        
        return user_scales

    @jwt_required()
    def create(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            user_permissions = current_user.get_permissions()
            can_create_scale = 'escala_create' in user_permissions or 'all' in user_permissions
            
            if not can_create_scale:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para criar escalas.'
                }), 403
            
            data = request.get_json()
            
            required_fields = ['event', 'date', 'time', 'ministry', 'members']
            for field in required_fields:
                if not data.get(field):
                    return jsonify({'success': False, 'error': f'Campo {field} é obrigatório'}), 400
            
            ministry = Ministry.query.get(data['ministry'])
            if not ministry:
                return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
            
            if current_user.role != 'admin':
                if ministry.leader_id != current_user.id:
                    can_manage_all_ministries = 'ministerios_gerenciar_all' in user_permissions or 'all' in user_permissions
                    if not can_manage_all_ministries:
                        user_ministries = current_user.get_ministries() or []
                        if data['ministry'] not in user_ministries:
                            return jsonify({
                                'success': False, 
                                'error': 'Acesso negado. Você não tem acesso a este ministério.'
                            }), 403
            
            # VERIFICAR SE JÁ EXISTE ESCALA NA MESMA DATA/MINISTÉRIO
            scale_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
            existing_scale = Scale.query.filter(
                Scale.date == scale_date,
                Scale.ministry_id == data['ministry']
            ).first()
            
            if existing_scale:
                return jsonify({
                    'success': False, 
                    'error': f'Já existe uma escala ({existing_scale.event}) para esta data e ministério.'
                }), 400
            
            scale = Scale(
                event=data['event'],
                date=scale_date,
                time=data['time'],
                ministry_id=data['ministry'],
                description=data.get('description', ''),
                status=data.get('status', 'pending'),
                scale_type=data.get('scale_type', 'single'),
                scale_group=data.get('scale_group'),
                music_key=data.get('music_key'),
                month_reference=data.get('month_reference'),
                created_by=current_user_id
            )
            
            scale.set_members(data['members'])
            scale.set_songs(data.get('songs', []))
            scale.set_observations(data.get('observations', []))
            
            db.session.add(scale)
            db.session.commit()
            
            # Criar notificações e enviar mensagens
            notifications_created, whatsapp_sent = self._create_member_notifications(scale)
            
            return jsonify({
                'success': True,
                'data': {
                    'scale': scale.to_dict(),
                    'notifications_created': notifications_created,
                    'whatsapp_sent': whatsapp_sent
                },
                'message': f'Escala criada! {notifications_created} notificações e {whatsapp_sent} WhatsApp enviados.'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.create: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def _send_scale_emails_thread(self, scale, members_data, is_monthly):
        """Thread para envio de e-mails em background com contexto Flask"""
        try:
            print(f"\n🧵 THREAD DE E-MAIL INICIADA - Escala {scale.id}")
            
            # Importar dentro da thread
            from app import create_app
            
            # Criar nova aplicação Flask para esta thread
            app = create_app()
            
            with app.app_context():
                print(f"   📧 Contexto Flask criado para thread")
                
                # Pequena pausa para garantir que a resposta já foi enviada
                time.sleep(2)
                
                # Buscar ministério NOVAMENTE dentro do contexto
                ministry = Ministry.query.get(scale.ministry_id)
                if not ministry:
                    print("   ❌ Ministério não encontrado")
                    return
                
                # Buscar todas as escalas do grupo NOVAMENTE dentro do contexto
                if is_monthly and scale.scale_group:
                    scales = Scale.query.filter(
                        Scale.scale_group == scale.scale_group
                    ).order_by(Scale.date).all()
                    print(f"   📊 Encontradas {len(scales)} escalas no grupo")
                else:
                    scales = [scale]
                
                # Gerar imagem da tabela
                print(f"   🎨 Gerando imagem da tabela...")
                img_data = self._generate_scale_table_image_thread(scales, ministry)
                
                if not img_data:
                    print(f"   ❌ Falha ao gerar imagem da tabela")
                    return
                
                # Preparar destinatários
                recipients = []
                
                # Membros escalados
                for member in members_data:
                    member_id = member.get('id')
                    user = User.query.get(member_id)
                    if user and user.email:
                        recipients.append({
                            'email': user.email,
                            'name': user.name,
                            'role': member.get('role', 'Participante')
                        })
                
                # Líder do ministério
                if ministry.leader_id:
                    leader = User.query.get(ministry.leader_id)
                    if leader and leader.email:
                        recipients.append({
                            'email': leader.email,
                            'name': leader.name,
                            'role': 'Líder'
                        })
                
                if not recipients:
                    print(f"   ⚠️ Nenhum destinatário encontrado")
                    return
                
                print(f"   👥 {len(recipients)} destinatários para envio")
                
                # Enviar e-mails
                sent_count = 0
                for i, recipient in enumerate(recipients, 1):
                    try:
                        print(f"   📨 [{i}/{len(recipients)}] Enviando para {recipient['email']}...")
                        self._send_single_email(recipient, scale, ministry, img_data, is_monthly)
                        sent_count += 1
                        
                        # Pequena pausa para não sobrecarregar o servidor SMTP
                        time.sleep(0.5)
                        
                    except Exception as e:
                        print(f"   ❌ Erro ao enviar para {recipient['email']}: {e}")
                
                print(f"\n   ✅ ENVIO CONCLUÍDO: {sent_count}/{len(recipients)} e-mails enviados")
            
            print(f"   🧵 THREAD FINALIZADA")
            
        except Exception as e:
            print(f"   ❌ ERRO NA THREAD DE E-MAIL: {e}")
            import traceback
            traceback.print_exc()

    def _generate_scale_table_image_thread(self, scales, ministry):
        import io
        from datetime import datetime
        import matplotlib.pyplot as plt

        try:
            print("🎨 Gerando imagem da escala (versão estável)...")

            # ===============================
            # CONFIGURAÇÕES DE TEMA (TWITCH)
            # ===============================
            BG_COLOR = '#0F0F23'
            HEADER_COLOR = '#9146FF'
            ROW_ODD = '#1A1A2E'
            ROW_EVEN = '#2D2D44'
            TEXT_COLOR = '#FFFFFF'
            BORDER_COLOR = '#3A3A55'
            MUTED_TEXT = '#AAAAAA'

            # ===============================
            # CABEÇALHOS E DADOS
            # ===============================
            headers = ['Data', 'Dia']
            all_functions = []

            for scale in scales:
                for m in scale.get_members():
                    role = m.get('role', 'Participante')
                    if role not in all_functions:
                        all_functions.append(role)

            headers.extend(all_functions)
            headers.append('Descrição')

            dias_semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
            table_rows = []

            for scale in scales:
                scale_date = scale.date
                if not isinstance(scale_date, datetime):
                    scale_date = datetime.combine(scale_date, datetime.min.time())

                row = [
                    scale_date.strftime('%d/%m/%Y'),
                    dias_semana[scale_date.weekday()]
                ]

                members_by_role = {}
                for m in scale.get_members():
                    role = m.get('role', 'Participante')
                    user_id = m.get('id')
                    if user_id:
                        from models import User
                        user = User.query.get(user_id)
                        if user:
                            members_by_role.setdefault(role, []).append(user.name)

                for role in all_functions:
                    names = members_by_role.get(role, ['-'])
                    text = ', '.join(names)
                    if len(text) > 30:
                        text = ', '.join(names[:2]) + '...'
                    row.append(text)

                desc = scale.description or ''
                if len(desc) > 25:
                    desc = desc[:22] + '...'
                row.append(desc)

                table_rows.append(row)

            table_rows.sort(key=lambda r: datetime.strptime(r[0], '%d/%m/%Y'))

            table_data = [headers] + table_rows

            # ===============================
            # DIMENSÕES
            # ===============================
            num_cols = len(headers)
            num_rows = len(table_data)

            col_widths = [1.2, 0.8]  # Data, Dia
            for _ in all_functions:
                col_widths.append(1.8)
            col_widths.append(2.2)  # Descrição

            total_width = sum(col_widths)
            col_widths = [w / total_width for w in col_widths]

            fig_width = max(12, total_width * 1.1)
            fig_height = max(6, num_rows * 0.5 + 3)

            # ===============================
            # FIGURA
            # ===============================
            fig = plt.figure(figsize=(fig_width, fig_height), facecolor=BG_COLOR)

            # Título
            fig.text(0.5, 0.93, 'Escala Gerada Pelo Adorefy @Mike',
                    ha='center', fontsize=18, weight='bold', color=HEADER_COLOR)

            fig.text(0.5, 0.88, f'Ministério: {ministry.name}',
                    ha='center', fontsize=13, color=TEXT_COLOR)

            fig.text(0.5, 0.84,
                    datetime.now().strftime('Gerado em: %d/%m/%Y às %H:%M'),
                    ha='center', fontsize=9, color=MUTED_TEXT)

            # ===============================
            # EIXO DA TABELA (IMPORTANTE)
            # ===============================
            ax = fig.add_axes([0.03, 0.12, 0.94, 0.65])
            ax.axis('off')

            table = ax.table(
                cellText=table_data,
                colWidths=col_widths,
                cellLoc='center',
                loc='upper center'
            )

            table.auto_set_font_size(False)
            table.set_fontsize(9)

            # ===============================
            # ESTILIZAÇÃO DAS CÉLULAS
            # ===============================
            for (row, col), cell in table.get_celld().items():
                cell.set_edgecolor(BORDER_COLOR)
                cell.set_linewidth(0.6)
                cell.set_height(0.075)

                if row == 0:
                    cell.set_facecolor(HEADER_COLOR)
                    cell.set_text_props(color='white', weight='bold', fontsize=10)
                else:
                    cell.set_facecolor(ROW_ODD if row % 2 else ROW_EVEN)
                    cell.set_text_props(color=TEXT_COLOR)

            # ===============================
            # RODAPÉ
            # ===============================
            fig.text(0.5, 0.04,
                    'Adorefy - Gestão de Ministérios @Mike',
                    ha='center', fontsize=9, color='#777777', style='italic')

            # ===============================
            # EXPORTAÇÃO
            # ===============================
            buffer = io.BytesIO()
            plt.savefig(
                buffer,
                format='png',
                dpi=150,
                facecolor=BG_COLOR,
                bbox_inches='tight',
                pad_inches=0.2
            )
            plt.close(fig)

            buffer.seek(0)
            print("✅ Imagem gerada com sucesso (layout estável)")
            return buffer.getvalue()

        except Exception as e:
            print("❌ Erro ao gerar imagem:", e)
            import traceback
            traceback.print_exc()
            return self._generate_scale_table_fallback(scales, ministry)

    def _generate_scale_table_fallback(self, scales, ministry):
        """Fallback simples e consistente"""
        try:
            print("   🔄 Usando fallback para geração de imagem...")
            
            # Versão mais simples e estruturada
            data = []
            headers = ['Data', 'Dia']
            
            # Dias da semana abreviados
            dias_semana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
            
            # Coletar funções
            all_functions = []
            for scale in scales:
                members = scale.get_members()
                for member in members:
                    role = member.get('role', 'Participante')
                    if role and role not in all_functions:
                        all_functions.append(role)
            
            headers.extend(all_functions)
            headers.append('Descrição')
            
            # Preencher dados
            for scale in scales:
                row = []
                scale_date = scale.date
                if not isinstance(scale_date, datetime):
                    scale_date = datetime.combine(scale_date, datetime.min.time())
                
                row.append(scale_date.strftime('%d/%m/%Y'))
                row.append(dias_semana[scale_date.weekday()])
                
                # Mapear membros
                members = scale.get_members()
                member_by_role = {}
                for member in members:
                    role = member.get('role', 'Participante')
                    user_id = member.get('id')
                    if user_id:
                        from models import User
                        user = User.query.get(user_id)
                        if user:
                            if role in member_by_role:
                                member_by_role[role] += f", {user.name}"
                            else:
                                member_by_role[role] = user.name
                
                for function in all_functions:
                    cell_value = member_by_role.get(function, '-')
                    # Limitar nome muito longo
                    if len(cell_value) > 25:
                        parts = cell_value.split(', ')
                        if len(parts) > 2:
                            cell_value = ', '.join(parts[:2]) + '...'
                    row.append(cell_value)
                
                desc = scale.description or ''
                if len(desc) > 20:
                    desc = desc[:17] + '...'
                row.append(desc)
                
                data.append(row)
            
            # Criar figura simples
            num_cols = len(headers)
            num_rows = len(data) + 1
            
            # Dimensões fixas
            col_width = 1.5
            row_height = 0.5
            
            fig_width = max(10, num_cols * col_width)
            fig_height = max(8, num_rows * row_height + 2)
            
            fig, ax = plt.subplots(figsize=(fig_width, fig_height))
            ax.axis('tight')
            ax.axis('off')
            
            # Título
            ax.set_title(f'ESCALA - {ministry.name}', 
                        fontsize=16, fontweight='bold', pad=20,
                        color='#9146FF')
            
            # Data de geração
            geracao_str = datetime.now().strftime('Gerado em: %d/%m/%Y às %H:%M')
            ax.text(0.5, 0.95, geracao_str,
                fontsize=10, ha='center', transform=fig.transFigure,
                color='#666666')
            
            # Tabela
            table_data = [headers] + data
            table = ax.table(cellText=table_data,
                        cellLoc='center',
                        loc='center',
                        bbox=[0.1, 0.1, 0.8, 0.8])
            
            # Configurar tabela
            table.auto_set_font_size(False)
            table.set_fontsize(9)
            
            # Dimensões fixas para células
            for i in range(num_rows):
                for j in range(num_cols):
                    cell = table[(i, j)]
                    cell.set_height(row_height / fig_height)
                    
                    if i == 0:
                        cell.set_facecolor('#9146FF')
                        cell.set_text_props(weight='bold', color='white')
                        cell.set_fontsize(10)
                    else:
                        if i % 2 == 0:
                            cell.set_facecolor('#F0F0F0')
                        else:
                            cell.set_facecolor('#FFFFFF')
                        cell.set_text_props(color='#333333')
            
            # Salvar
            img_buffer = io.BytesIO()
            plt.savefig(img_buffer, format='png', dpi=120, 
                    bbox_inches='tight', pad_inches=0.3)
            plt.close(fig)
            img_buffer.seek(0)
            
            print(f"   ✅ Fallback gerado: {len(img_buffer.getvalue())} bytes")
            return img_buffer.getvalue()
            
        except Exception as e:
            print(f"   ❌ Erro no fallback: {e}")
            return None

    
    def _send_single_email(self, recipient, scale, ministry, img_data, is_monthly):
        """Envia e-mail para um destinatário usando Homehost/Roundcube"""
        try:
            print(f"      ✉️ Enviando e-mail para {recipient['email']}...")
            
            # Usar sua configuração de e-mail do Homehost
            recipient_email = recipient_email or os.getenv('EMAIL_TEST_RECIPIENT', '')
            SMTP_SERVER = EMAIL_CONFIG['smtp_server']
            SMTP_PORT = EMAIL_CONFIG['smtp_port']
            SENDER_EMAIL = EMAIL_CONFIG['sender_email']
            SENDER_PASSWORD = EMAIL_CONFIG['sender_password']
            USE_TLS = EMAIL_CONFIG['use_tls']

            if not all([SMTP_SERVER, SENDER_EMAIL, SENDER_PASSWORD, recipient_email]):
                print("⚠️ Configuração de e-mail incompleta. Verifique SMTP_SERVER, EMAIL_SENDER, EMAIL_PASSWORD e EMAIL_TEST_RECIPIENT no .env")
                return False
            
            # Criar mensagem
            msg = MIMEMultipart('related')
            msg['From'] = f"Adorefy - Gestor de Escalas <{SENDER_EMAIL}>"
            msg['To'] = recipient['email']
            msg['Reply-To'] = SENDER_EMAIL
            
            # Configurar assunto
            if is_monthly:
                month_ref = getattr(scale, 'month_reference', '')
                if month_ref:
                    if hasattr(month_ref, 'strftime'):
                        month_str = month_ref.strftime('%B/%Y')
                    else:
                        month_str = str(month_ref)
                    msg['Subject'] = f'Escala Mensal - {ministry.name} - {month_str}'
                else:
                    msg['Subject'] = f'Escala Mensal - {ministry.name}'
            else:
                scale_date = scale.date.strftime('%d/%m/%Y')
                msg['Subject'] = f'Escala - {ministry.name} - {scale_date}'
            
            # Corpo do e-mail em HTML
            scale_date_display = scale.date.strftime('%d/%m/%Y')
            current_time = datetime.now().strftime('%d/%m/%Y %H:%M')
            
            html = f"""
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {{
                        font-family: Arial, sans-serif;
                        line-height: 1.6;
                        color: #333;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                        background-color: #f5f5f5;
                    }}
                    .container {{
                        background-color: white;
                        border-radius: 10px;
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                        overflow: hidden;
                    }}
                    .header {{
                        background: linear-gradient(135deg, #0066cc 0%, #004d99 100%);
                        padding: 25px;
                        color: white;
                        text-align: center;
                    }}
                    .content {{
                        padding: 25px;
                    }}
                    .info-box {{
                        background-color: #f0f7ff;
                        border-left: 4px solid #0066cc;
                        padding: 15px;
                        margin: 20px 0;
                        border-radius: 0 5px 5px 0;
                    }}
                    .table-container {{
                        text-align: center;
                        margin: 25px 0;
                        padding: 15px;
                        background-color: #f9f9f9;
                        border-radius: 5px;
                        border: 1px solid #e0e0e0;
                    }}
                    .footer {{
                        text-align: center;
                        color: #666;
                        font-size: 0.9em;
                        padding: 20px;
                        background-color: #f8f9fa;
                        border-top: 1px solid #e9ecef;
                    }}
                    .logo {{
                        text-align: center;
                        margin-bottom: 20px;
                    }}
                    .logo img {{
                        max-width: 150px;
                        height: auto;
                    }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1 style="margin: 0; font-size: 24px;">Ministério {ministry.name}</h1>
                        <p style="margin: 10px 0 0; opacity: 0.9;">Sistema de Gestão de Escalas</p>
                    </div>
                    
                    <div class="content">
                        <h2 style="color: #2c3e50; margin-top: 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">
                            Olá, {recipient['name']}!
                        </h2>
                        
                        <p>Você foi escalado(a) para participar do ministério. Confira os detalhes abaixo:</p>
                        
                        <div class="info-box">
                            <h3 style="color: #0066cc; margin-top: 0;">📋 Detalhes da Escala</h3>
                            <p style="margin: 5px 0;"><strong>Ministério:</strong> {ministry.name}</p>
                            <p style="margin: 5px 0;"><strong>Sua Função:</strong> {recipient['role']}</p>
                            <p style="margin: 5px 0;"><strong>Data:</strong> {scale_date_display if not is_monthly else 'Mês Completo'}</p>
                            <p style="margin: 5px 0;"><strong>Horário:</strong> {scale.time}</p>
                            <p style="margin: 5px 0;"><strong>Local:</strong> Igreja (confirmar localização)</p>
                        </div>
                        
                        <div class="table-container">
                            <h3 style="color: #2c3e50; margin-top: 0;">
                                {'📅 Escala Mensal' if is_monthly else '📅 Escala do Dia'}
                            </h3>
                            <p>Confira abaixo a tabela com todos os escalados:</p>
                            <img src="cid:scale_table" alt="Tabela de Escala" style="max-width: 100%; border-radius: 5px;" />
                        </div>
                        
                        <div style="background-color: #fff8e1; padding: 15px; border-radius: 5px; margin-top: 20px; border-left: 4px solid #ffb300;">
                            <h4 style="color: #e65100; margin-top: 0;">⚠️ Informações Importantes</h4>
                            <ul style="margin-bottom: 0;">
                                <li><strong>Confirmação:</strong> Por favor, confirme sua presença</li>
                                <li><strong>Ponto:</strong> Chegar com 30 minutos de antecedência</li>
                                <li><strong>Repertório:</strong> Estudar as músicas previamente</li>
                                <li><strong>Impedimentos:</strong> Comunicar com antecedência ao líder</li>
                                <li><strong>Uniforme:</strong> Vestir roupa adequada para o culto</li>
                            </ul>
                        </div>
                        
                        <div style="margin-top: 25px; padding: 15px; background-color: #e8f5e9; border-radius: 5px;">
                            <p style="margin: 0; color: #2e7d32;">
                                <strong>🙏 Agradecemos seu serviço!</strong><br>
                                Seu ministério é fundamental para a adoração.
                            </p>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>
                            <strong>Sistema de Gestão de Escalas - Adorefy App</strong><br>
                            Este é um e-mail automático, por favor não responder.<br>
                            Dúvidas? Entre em contato com o líder do ministério.
                        </p>
                        <p style="color: #999; font-size: 0.8em; margin-top: 10px;">
                            Gerado em {current_time}
                        </p>
                    </div>
                </div>
            </body>
            </html>
            """
            
            # Parte HTML
            msg_html = MIMEText(html, 'html')
            msg.attach(msg_html)
            
            # Anexar imagem
            if img_data:
                img = MIMEImage(img_data)
                img.add_header('Content-ID', '<scale_table>')
                img.add_header('Content-Disposition', 'inline', filename=f'escala_{ministry.name.replace(" ", "_")}.png')
                msg.attach(img)
            
            print(f"🔗 Conectando ao Homehost SMTP...")
            
            try:
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=15) as server:
                    server.set_debuglevel(0)  # Desativar debug para produção
                    
                    if USE_TLS:
                        print(f"🔐 Iniciando TLS...")
                        server.starttls()
                    
                    print(f"      👤 Autenticando...")
                    server.login(SENDER_EMAIL, SENDER_PASSWORD)
                    
                    print(f"📤 Enviando mensagem...")
                    server.send_message(msg)
                    
                    print(f"✅ E-mail aceito pelo servidor (código 250)")
                    
            except smtplib.SMTPServerDisconnected as e:
                # O e-mail já foi enviado, só o QUIT falhou
                print(f"⚠️  Servidor desconectou após envio")
                print(f"O e-mail foi enviado, mas a conexão fechou cedo")
                print(f"Isso é normal em alguns servidores")
                return True  # Considera sucesso mesmo com desconexão
            
            except Exception as e:
                print(f"❌ Erro durante envio: {e}")
                raise
            
            print(f"✅ E-mail enviado com sucesso para {recipient['email']}")
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            print(f"❌ ERRO: Falha na autenticação")
            print(f"Verifique usuário/senha do Homehost")
            return False
            
        except Exception as e:
            print(f"  ❌ Erro geral: {e}")
            return False

    def _generate_scale_table_image(self, scale, ministry, members_data, is_monthly):
        """Gera imagem da tabela de escalas"""
        try:
            print("   🎨 Gerando imagem da tabela...")
            
            # Se for mensal, buscar todas as escalas do grupo
            if is_monthly and scale.scale_group:
                scales = Scale.query.filter(
                    Scale.scale_group == scale.scale_group
                ).order_by(Scale.date).all()
            else:
                scales = [scale]
            
            # Preparar dados
            data = []
            headers = ['Data', 'Dia']
            
            # Funções únicas
            all_functions = []
            for s in scales:
                members = s.get_members()
                for member in members:
                    role = member.get('role', 'Participante')
                    if role not in all_functions:
                        all_functions.append(role)
            
            headers.extend(all_functions)
            headers.append('Descrição')
            
            # Preencher dados
            for s in scales:
                row = []
                scale_date = s.date if isinstance(s.date, datetime) else datetime.combine(s.date, datetime.min.time())
                row.append(scale_date.strftime('%d/%m'))
                row.append(scale_date.strftime('%a')[:3])
                
                # Mapear membros
                members = s.get_members()
                member_by_role = {}
                for member in members:
                    role = member.get('role', 'Participante')
                    user = User.query.get(member.get('id'))
                    if user:
                        member_by_role[role] = user.name
                
                # Preencher funções
                for function in all_functions:
                    row.append(member_by_role.get(function, '-'))
                
                # Descrição
                desc = s.description or ''
                if len(desc) > 20:
                    desc = desc[:17] + '...'
                row.append(desc)
                
                data.append(row)
            
            # Criar figura
            fig, ax = plt.subplots(figsize=(max(10, len(headers) * 1.5), 4 + len(scales) * 0.4))
            ax.axis('tight')
            ax.axis('off')
            
            # Criar tabela
            table_data = [headers] + data
            table = ax.table(cellText=table_data, cellLoc='center', loc='center')
            
            # Estilizar
            table.auto_set_font_size(False)
            table.set_fontsize(9)
            table.scale(1, 1.5)
            
            # Cores
            for i in range(len(headers)):
                cell = table[(0, i)]
                cell.set_facecolor('#2c3e50')
                cell.set_text_props(weight='bold', color='white')
            
            for i in range(1, len(data) + 1):
                row_color = '#ffffff' if i % 2 == 1 else '#f8f9fa'
                for j in range(len(headers)):
                    cell = table[(i, j)]
                    cell.set_facecolor(row_color)
            
            # Título
            plt.title(f'Escala - {ministry.name}', fontsize=12, pad=20)
            
            # Salvar
            img_buffer = io.BytesIO()
            plt.savefig(img_buffer, format='png', dpi=120, bbox_inches='tight')
            plt.close(fig)
            img_buffer.seek(0)
            
            print("   ✅ Imagem gerada")
            return img_buffer.getvalue()
            
        except Exception as e:
            print(f"   ❌ Erro ao gerar imagem: {e}")
            return None


    @jwt_required()
    def create_monthly_scale_batch(self):
        """Cria múltiplas escalas para um mês (escala mensal)"""
        try:
            print("\n" + "="*70)
            print("🚀 INICIANDO CRIAÇÃO DE ESCALA MENSAL EM BATCH")
            print("="*70)
            
            # ETAPA 1: AUTENTICAÇÃO
            print("🔐 ETAPA 1: Verificando usuário...")
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                print("❌ ERRO: Usuário não encontrado")
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            print(f"✅ Usuário: {current_user.name} (ID: {current_user_id})")
            
            # ETAPA 2: PERMISSÕES
            print("🔐 ETAPA 2: Verificando permissões...")
            user_permissions = current_user.get_permissions()
            can_create_scale = 'month_scales' in user_permissions or 'all' in user_permissions
        
            if not can_create_scale:
                print("❌ ERRO: Sem permissão para criar escalas")
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para criar escalas.'
                }), 403
            
            print("✅ Permissão confirmada")
            
            # ETAPA 3: DADOS DA REQUISIÇÃO
            print("📥 ETAPA 3: Processando dados...")
            data = request.get_json()

            print(data)
            
            if not data:
                print("❌ ERRO: Sem dados JSON")
                return jsonify({'success': False, 'error': 'Dados não fornecidos'}), 400
            
            scales_data = data.get('scales', [])
            
            if not scales_data or not isinstance(scales_data, list) or len(scales_data) == 0:
                print("❌ ERRO: Lista de escalas vazia")
                return jsonify({'success': False, 'error': 'Nenhuma escala para criar'}), 400
            
            print(f"✅ {len(scales_data)} escalas para processar")
            
            # ETAPA 4: VALIDAÇÃO INICIAL
            print("🔍 ETAPA 4: Validando dados...")
            first_scale = scales_data[0]
            
            if not first_scale.get('event'):
                print("❌ ERRO: Evento obrigatório")
                return jsonify({'success': False, 'error': 'Campo event é obrigatório'}), 400
            
            if not first_scale.get('ministry'):
                print("❌ ERRO: Ministério obrigatório")
                return jsonify({'success': False, 'error': 'Campo ministry é obrigatório'}), 400
            
            ministry_id = first_scale['ministry']
            month_reference = first_scale.get('month_reference')
            
            # ETAPA 5: VERIFICAÇÃO DO MINISTÉRIO
            print("🏛️ ETAPA 5: Verificando ministério...")
            ministry = Ministry.query.get(ministry_id)
            if not ministry:
                print(f"❌ ERRO: Ministério {ministry_id} não encontrado")
                return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
            
            print(f"✅ Ministério: {ministry.name}")
            
            # ETAPA 6: PERMISSÃO PARA O MINISTÉRIO
            print("🔐 ETAPA 6: Verificando acesso ao ministério...")
            if current_user.role != 'admin':
                if ministry.leader_id != current_user.id:
                    can_manage_all = 'ministerios_gerenciar_all' in user_permissions or 'all' in user_permissions
                    if not can_manage_all:
                        user_ministries = current_user.get_ministries() or []
                        if ministry_id not in user_ministries:
                            print(f"❌ ERRO: Sem acesso ao ministério")
                            return jsonify({
                                'success': False, 
                                'error': 'Acesso negado. Você não tem acesso a este ministério.'
                            }), 403
            
            print("✅ Acesso ao ministério confirmado")
            
            # ETAPA 7: PREPARAÇÃO
            print("⚙️ ETAPA 7: Preparando criação...")
            scale_group = str(uuid.uuid4())
            created_scales = []
            skipped_dates = []
            all_notifications = 0

            # ETAPA 8: PROCESSAMENTO DAS ESCALAS
            print("🔄 ETAPA 8: Criando escalas...")
            for i, scale_data in enumerate(scales_data, 1):
                try:
                    print(f"   📅 Processando escala {i}/{len(scales_data)}...")
                    
                    if not scale_data.get('date'):
                        print(f"   ⚠️ Sem data, pulando")
                        skipped_dates.append({
                            'date': 'Desconhecida',
                            'reason': 'Data não especificada'
                        })
                        continue
                    
                    scale_date_str = scale_data['date']
                    try:
                        scale_date = datetime.strptime(scale_date_str, '%Y-%m-%d').date()
                        #scale_date = scale_date - timedelta(days=1)
                    except ValueError as e:
                        print(f"   ❌ Data inválida: {scale_date_str}")
                        skipped_dates.append({
                            'date': scale_date_str,
                            'reason': f'Data inválida: {str(e)}'
                        })
                        continue
                    
                    # Verificar se já existe escala
                    existing_scale = Scale.query.filter(
                        Scale.date == scale_date,
                        Scale.ministry_id == ministry_id
                    ).first()
                    
                    if existing_scale:
                        print(f"   ⚠️ Já existe escala nesta data")
                        skipped_dates.append({
                            'date': scale_date_str,
                            'reason': f'Já existe escala "{existing_scale.event}" nesta data',
                            'existing_scale_id': existing_scale.id
                        })
                        continue
                    
                    # Criar escala
                    scale = Scale(
                        event=scale_data['event'],
                        date=scale_date,
                        time=scale_data.get('time', '19:00'),
                        ministry_id=ministry_id,
                        description=scale_data.get('description', ''),
                        status=scale_data.get('status', 'pending'),
                        scale_type='monthly_group',
                        scale_group=scale_group,
                        month_reference=datetime.strptime(month_reference, '%Y-%m').date() if month_reference else None,
                        created_by=current_user_id
                    )
                    
                    # Configurar membros
                    members = scale_data.get('members', [])
                    if not members:
                        print(f"   ⚠️ Sem membros, pulando")
                        skipped_dates.append({
                            'date': scale_date_str,
                            'reason': 'Nenhum membro selecionado para esta data'
                        })
                        continue
                    
                    if isinstance(members, list):
                        scale.set_members(members)
                    else:
                        print(f"   ⚠️ Formato inválido de membros")
                        if isinstance(members, str):
                            try:
                                members_list = json.loads(members)
                                if isinstance(members_list, list):
                                    scale.set_members(members_list)
                                else:
                                    skipped_dates.append({
                                        'date': scale_date_str,
                                        'reason': 'Formato inválido de membros'
                                    })
                                    continue
                            except json.JSONDecodeError:
                                skipped_dates.append({
                                    'date': scale_date_str,
                                    'reason': 'Formato inválido de membros'
                                })
                                continue
                        else:
                            skipped_dates.append({
                                'date': scale_date_str,
                                'reason': 'Formato inválido de membros'
                            })
                            continue
                    
                    # Configurar músicas e observações
                    songs = scale_data.get('songs', [])
                    print(songs)
                    if songs:
                        scale.set_songs(songs)
                    
                    observations = scale_data.get('observations', [])
                    if observations:
                        scale.set_observations(observations)
                    
                    # Campos extras
                    if scale_data.get('music_key'):
                        scale.music_key = scale_data['music_key']
                    
                    if 'send_lyrics' in scale_data:
                        scale.send_lyrics = bool(scale_data['send_lyrics'])
                    
                    db.session.add(scale)
                    created_scales.append(scale)
                    
                    print(f"   ✅ Escala criada para {scale_date_str}")
                    
                except Exception as e:
                    db.session.rollback()
                    print(f"   ❌ Erro: {str(e)[:100]}...")
                    skipped_dates.append({
                        'date': scale_data.get('date', 'Desconhecida'),
                        'reason': f'Erro: {str(e)[:50]}...'
                    })
                    continue
            
            # ETAPA 9: SALVAR NO BANCO
            print("\n💾 ETAPA 9: Salvando no banco...")
            if not created_scales:
                print("⚠️ Nenhuma escala criada")
                return jsonify({
                    'success': False,
                    'error': 'Nenhuma escala válida foi criada.'
                }), 400
            
            try:
                db.session.flush()
                db.session.commit()
                print(f"✅ {len(created_scales)} escalas salvas")
            except Exception as commit_error:
                db.session.rollback()
                print(f"❌ Erro no commit: {commit_error}")
                return jsonify({
                    'success': False, 
                    'error': f'Erro ao salvar: {str(commit_error)}'
                }), 500
            
            # ETAPA 10: NOTIFICAÇÕES E WHATSAPP
            print("\n🔔 ETAPA 10: Criando notificações e enviando WhatsApp...")
            whatsapp_sent_total = 0
            
            for scale in created_scales:
               
                    # Criar notificações
                    notifications = self._create_monthly_scale_notifications(scale, scale.get_members())
                    all_notifications += notifications
                    
                    # Enviar WhatsApp para membros usando o WhatsAppController
                    whatsapp_sent = self._send_whatsapp_for_monthly_scale(scale, scale_data.get('music_key'), scale.get_members())
                    whatsapp_sent_total += whatsapp_sent
                    
                
            
            # ETAPA 11: ENVIO DE E-MAILS EM THREAD
            print("\n📧 ETAPA 11: Preparando envio de e-mails...")
            if created_scales:
                first_scale = created_scales[0]
                members_data = first_scale.get_members()
                
                if members_data:
                    print(f"📨 Iniciando thread de e-mail para {len(members_data)} membros...")
                    
                    # Criar função closure que captura os dados necessários
                    def send_emails_in_thread():
                        try:
                            print(f"\n🧵 THREAD DE E-MAIL INICIADA")
                            
                            # Criar uma nova aplicação Flask para esta thread
                            from app import create_app
                            app = create_app()
                            
                            with app.app_context():
                                print(f"   📧 Contexto Flask criado")
                                
                                # Recriar os objetos dentro do contexto
                                scale = Scale.query.get(first_scale.id)
                                ministry = Ministry.query.get(first_scale.ministry_id)
                                
                                if not scale or not ministry:
                                    print(f"   ❌ Dados não encontrados")
                                    return
                                
                                # Buscar escalas do grupo
                                if scale.scale_group:
                                    scales = Scale.query.filter(
                                        Scale.scale_group == scale.scale_group
                                    ).order_by(Scale.date).all()
                                else:
                                    scales = [scale]
                                
                                # Gerar imagem
                                img_data = self._generate_scale_table_image_thread(scales, ministry)
                                
                                if not img_data:
                                    print(f"   ❌ Falha ao gerar imagem")
                                    return
                                
                                # Preparar destinatários
                                recipients = []
                                
                                # Membros escalados
                                for member in members_data:
                                    member_id = member.get('id')
                                    user = User.query.get(member_id)
                                    if user and user.email:
                                        recipients.append({
                                            'email': user.email,
                                            'name': user.name,
                                            'role': member.get('role', 'Participante')
                                        })
                                
                                # Líder
                                if ministry.leader_id:
                                    leader = User.query.get(ministry.leader_id)
                                    if leader and leader.email:
                                        recipients.append({
                                            'email': leader.email,
                                            'name': leader.name,
                                            'role': 'Líder'
                                        })
                                
                                if not recipients:
                                    print(f"   ⚠️ Nenhum destinatário")
                                    return
                                
                                print(f"   👥 {len(recipients)} destinatários")
                                
                                # Enviar e-mails
                                sent_count = 0
                                for recipient in recipients:
                                    try:
                                        self._send_single_email(recipient, scale, ministry, img_data, True)
                                        sent_count += 1
                                        time.sleep(0.5)
                                    except Exception as e:
                                        print(f"   ❌ Erro: {e}")
                                
                                print(f"\n   ✅ {sent_count}/{len(recipients)} e-mails enviados")
                        
                        except Exception as e:
                            print(f"   ❌ ERRO NA THREAD: {e}")
                    
                    # Iniciar thread
                    email_thread = threading.Thread(
                        target=send_emails_in_thread,
                        name=f"EmailThread-{first_scale.scale_group}",
                        daemon=True
                    )
                    email_thread.start()
                    print("✅ Thread de e-mail iniciada em background")
            
            # ETAPA 12: RESPOSTA
            print("\n📋 ETAPA 12: Preparando resposta...")
            response_data = []
            for scale in created_scales:
                try:
                    response_data.append(scale.to_dict())
                except Exception as e:
                    response_data.append({
                        'id': scale.id,
                        'event': scale.event,
                        'date': scale.date.isoformat() if scale.date else None,
                        'time': scale.time,
                        'ministry_id': scale.ministry_id,
                        'status': scale.status
                    })
            
            print("\n" + "="*70)
            print("🎉 PROCESSAMENTO CONCLUÍDO!")
            print("="*70)
            print(f"📊 RESUMO:")
            print(f"   ✅ Escalas criadas: {len(created_scales)}")
            print(f"   ⚠️  Ignoradas: {len(skipped_dates)}")
            print(f"   🔔 Notificações: {all_notifications}")
            print(f"   📱 WhatsApp enviados: {whatsapp_sent_total}")
            print(f"   📧 E-mails: Em processamento")
            print("="*70)
            
            return jsonify({
                'success': True,
                'data': {
                    'scale_group': scale_group,
                    'created_scales': response_data,
                    'created_count': len(created_scales),
                    'skipped_dates': skipped_dates,
                    'notifications_created': all_notifications,
                    'whatsapp_sent': whatsapp_sent_total,
                    'month_reference': month_reference,
                    'email_status': 'processing_in_background'
                },
                'message': f'Escala mensal criada! {len(created_scales)} datas escaladas. {whatsapp_sent_total} WhatsApp enviados. E-mails sendo enviados.'
            })
            
        except Exception as e:
            db.session.rollback()
            print("\n" + "="*70)
            print("❌ ERRO CRÍTICO")
            print("="*70)
            import traceback
            print(f"Erro: {str(e)}")
            traceback.print_exc()
            print("="*70)
            
            return jsonify({'success': False, 'error': str(e)}), 500

    def _send_whatsapp_for_monthly_scale(self, scale, music_key, members_data): #mike99
        """Envia WhatsApp para membros de escala mensal usando WhatsAppController"""
        whatsapp_sent = 0
        
        for member in members_data:
            member_id = member.get('id')
            
            user = User.query.get(member_id)
            if user and hasattr(user, 'phone') and user.phone:
                # Preparar dados do membro
                member_data = {
                    'id': user.id,
                    'name': user.name,
                    'phone': user.phone,
                    'role': member.get('role', 'Participante')
                }
                
                
                # Enviar WhatsApp em thread separada usando a função auxiliar com contexto
                whatsapp_thread = threading.Thread(
                  target=self._send_whatsapp_with_context,
                     args=(
                     member_data,
                     scale.id,
                     music_key,
                     True          # is_monthly
                  ),
                  daemon=True,
                  name=f"WhatsAppMonthly-{member_id}"
                )

                whatsapp_thread.start()
                whatsapp_sent += 1
        
        return whatsapp_sent

    def _send_scale_emails_thread_with_context(self, scale_id, scale_group, ministry_id, members_data, is_monthly):
        """Versão mais segura que passa apenas IDs"""
        try:
            print(f"\n🧵 THREAD DE E-MAIL INICIADA - Escala ID: {scale_id}")
            
            # IMPORTANTE: Importar dentro da função e criar contexto manualmente
            from app import create_app  # Importe a função que cria seu app Flask
            
            # Criar uma nova instância do app para esta thread
            app = create_app()
            
            with app.app_context():
                print(f"   📧 Contexto Flask estabelecido")
                
                # Buscar objetos dentro do contexto
                scale = Scale.query.get(scale_id)
                if not scale:
                    print(f"   ❌ Escala {scale_id} não encontrada")
                    return
                
                ministry = Ministry.query.get(ministry_id)
                if not ministry:
                    print(f"   ❌ Ministério {ministry_id} não encontrada")
                    return
                
                # Buscar escalas do grupo se for mensal
                if is_monthly and scale_group:
                    scales = Scale.query.filter(
                        Scale.scale_group == scale_group
                    ).order_by(Scale.date).all()
                    print(f"   📊 Encontradas {len(scales)} escalas no grupo")
                else:
                    scales = [scale]
                
                # Gerar imagem
                print(f"   🎨 Gerando imagem da tabela...")
                img_data = self._generate_scale_table_image_thread(scales, ministry)
                
                if not img_data:
                    print(f"   ❌ Falha ao gerar imagem")
                    return
                
                # Preparar destinatários
                recipients = []
                
                # Membros escalados
                for member in members_data:
                    member_id = member.get('id')
                    user = User.query.get(member_id)
                    if user and user.email:
                        recipients.append({
                            'email': user.email,
                            'name': user.name,
                            'role': member.get('role', 'Participante')
                        })
                
                # Líder do ministério
                if ministry.leader_id:
                    leader = User.query.get(ministry.leader_id)
                    if leader and leader.email:
                        recipients.append({
                            'email': leader.email,
                            'name': leader.name,
                            'role': 'Líder'
                        })
                
                if not recipients:
                    print(f"   ⚠️ Nenhum destinatário")
                    return
                
                print(f"   👥 {len(recipients)} destinatários")
                
                # Enviar e-mails
                sent_count = 0
                for i, recipient in enumerate(recipients, 1):
                    try:
                        print(f"   📨 [{i}/{len(recipients)}] {recipient['email']}")
                        self._send_single_email(recipient, scale, ministry, img_data, is_monthly)
                        sent_count += 1
                        time.sleep(0.5)
                    except Exception as e:
                        print(f"   ❌ Erro: {e}")
                
                print(f"\n   ✅ {sent_count}/{len(recipients)} e-mails enviados")
                print(f"   🧵 THREAD FINALIZADA")
                
        except Exception as e:
            print(f"   ❌ ERRO NA THREAD: {e}")
            import traceback
            traceback.print_exc()

    def _create_member_notifications(self, scale):
        """Cria notificações e envia WhatsApp para membros escalados"""
        notifications_created = 0
        whatsapp_sent = 0
        members = scale.get_members()
        
        # Buscar ministro (líder do ministério ou criador da escala)
        minister = None
        ministry = Ministry.query.get(scale.ministry_id)
        if ministry and ministry.leader_id:
            minister = User.query.get(ministry.leader_id)
        
        if not minister and scale.created_by:
            minister = User.query.get(scale.created_by)
        
        for member in members:
            member_id = member.get('id')
            member_role = member.get('role', 'Participante')
            
            if member_id == scale.created_by:
                continue
            
            user = User.query.get(member_id)
            if user:
                # 1. Criar notificação no banco
                scale_date = scale.date.strftime('%d/%m/%Y')
                
                notification = Notification(
                    user_id=member_id,
                    title='🎵 Você foi escalado!',
                    message=f'Você foi escalado para "{scale.event}" em {scale_date} às {scale.time} como {member_role}',
                    type='scale_invite',
                    data=json.dumps({
                        'scale_id': scale.id,
                        'scale_event': scale.event,
                        'scale_date': scale_date,
                        'scale_time': scale.time,
                        'ministry_id': scale.ministry_id,
                        'music_key': scale.music_key,
                        'role': member_role,
                        'action': 'added_to_scale'
                    }),
                    is_read=False,
                    created_at=datetime.utcnow()
                )
                
                db.session.add(notification)
                notifications_created += 1
                
                print(f"enviando mensagem pelo botzap para {user.name} - {user.phone}")
                
                # 2. Enviar WhatsApp se o usuário tiver telefone
                if hasattr(user, 'phone') and user.phone:
                    # Preparar dados para envio em thread
                    member_data = {
                        'id': user.id,
                        'name': user.name,
                        'phone': user.phone,
                        'role': member_role
                    }
                    
                    # Iniciar thread para envio de WhatsApp usando a função auxiliar
                    whatsapp_thread = threading.Thread(
                        target=self._send_whatsapp_with_context,
                        args=(member_data, scale.id, scale.music_key, False),
                        daemon=True,
                        name=f"WhatsAppSingle-{member_id}"
                    )
                    whatsapp_thread.start()
                    whatsapp_sent += 1
        
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro ao salvar notificações: {str(e)}")
        
        print(f"📊 Notificações: {notifications_created}, WhatsApp: {whatsapp_sent}")
        return notifications_created, whatsapp_sent

    def _create_monthly_scale_notifications(self, scale, members_data):
        notifications_created = 0
        
        for member in members_data:
            member_id = member.get('id')
            member_role = member.get('role', 'Participante')
            
            if member_id == scale.created_by:
                continue
            
            user = User.query.get(member_id)
            if user:
                scale_date = scale.date.strftime('%d/%m/%Y')
                
                try:
                    month_name = datetime.strptime(scale.month_reference, '%Y-%m').strftime('%B')
                except:
                    month_name = scale.month_reference
                
                notification = Notification(
                    user_id=member_id,
                    title='📅 Escala Mensal - Você foi escalado!',
                    message=f'Você foi escalado para "{scale.event}" em {scale_date} às {scale.time} como {member_role}',
                    type='monthly_scale',
                    data=json.dumps({
                        'scale_id': scale.id,
                        'scale_group': scale.scale_group,
                        'scale_event': scale.event,
                        'scale_date': scale_date,
                        'scale_time': scale.time,
                        'ministry_id': scale.ministry_id,
                        'role': member_role,
                        'month': month_name
                    }),
                    is_read=False,
                    created_at=datetime.utcnow()
                )
                
                db.session.add(notification)
                notifications_created += 1
                
        
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao salvar notificações: {str(e)}")
        
        return notifications_created
    
    @jwt_required()
    def get_monthly_scale_groups(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            user_permissions = current_user.get_permissions()
            has_escala_view = 'escala_view' in user_permissions or 'all' in user_permissions
            
            if not has_escala_view:
                return jsonify({
                    'success': False, 
                    'error': 'Você não tem permissão para visualizar escalas'
                }), 403
            
            query = Scale.query.filter(
                Scale.scale_type == 'monthly_group'
            ).distinct(Scale.scale_group)
            
            if current_user.role == 'admin':
                pass
            elif current_user.role == 'lider':
                led_ministries = Ministry.query.filter_by(leader_id=current_user_id).all()
                ministry_ids = [m.id for m in led_ministries]
                if ministry_ids:
                    query = query.filter(Scale.ministry_id.in_(ministry_ids))
                else:
                    query = query.filter(Scale.id == 0)
            else:
                user_ministries = current_user.get_ministries() or []
                if user_ministries:
                    query = query.filter(Scale.ministry_id.in_(user_ministries))
                else:
                    query = query.filter(Scale.id == 0)
            
            monthly_scales = query.all()
            
            grouped_scales = {}
            for scale in monthly_scales:
                if scale.scale_group not in grouped_scales:
                    grouped_scales[scale.scale_group] = {
                        'scale_group': scale.scale_group,
                        'month_reference': scale.month_reference,
                        'event': scale.event,
                        'ministry_id': scale.ministry_id,
                        'ministry_name': scale.ministry.name if scale.ministry else '',
                        'time': scale.time,
                        'created_by': scale.created_by,
                        'created_at': scale.created_at.isoformat() if scale.created_at else None,
                        'scales_count': 0,
                        'scales': []
                    }
                
                grouped_scales[scale.scale_group]['scales_count'] += 1
            
            scale_groups = list(grouped_scales.keys())
            if scale_groups:
                all_scales = Scale.query.filter(
                    Scale.scale_group.in_(scale_groups)
                ).order_by(Scale.date).all()
                
                for scale in all_scales:
                    if scale.scale_group in grouped_scales:
                        grouped_scales[scale.scale_group]['scales'].append(scale.to_dict())
            
            return jsonify({
                'success': True,
                'data': {
                    'monthly_groups': list(grouped_scales.values()),
                    'count': len(grouped_scales)
                }
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.get_monthly_scale_groups: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def get_monthly_scale_group_details(self, scale_group):
        print("chegou aqui")
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            scales = Scale.query.filter(
                Scale.scale_group == scale_group
            ).order_by(Scale.date).all()
            
            if not scales:
                return jsonify({'success': False, 'error': 'Grupo de escalas não encontrado'}), 404
            
            first_scale = scales[0]
            user_permissions = current_user.get_permissions()
            permitted_ministries = current_user.get_permitted_ministries()
            
            can_view = self._check_scale_permission(current_user, first_scale, user_permissions, permitted_ministries)
            if not can_view:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para visualizar estas escalas.'
                }), 403
            
            scales_data = []
            for scale in scales:
                scale_dict = scale.to_dict()
                if scale.ministry:
                    scale_dict['ministry_name'] = scale.ministry.name
                scales_data.append(scale_dict)
            
            group_info = {
                'scale_group': first_scale.scale_group,
                'month_reference': first_scale.month_reference,
                'event': first_scale.event,
                'time': first_scale.time,
                'ministry_id': first_scale.ministry_id,
                'ministry_name': first_scale.ministry.name if first_scale.ministry else '',
                'description': first_scale.description,
                'members': first_scale.get_members(),
                'songs': first_scale.get_songs(),
                'observations': first_scale.get_observations(),
                'created_by': first_scale.created_by,
                'created_at': first_scale.created_at.isoformat() if first_scale.created_at else None,
                'total_scales': len(scales),
                'confirmed_scales': len([s for s in scales if s.status == 'confirmed']),
                'pending_scales': len([s for s in scales if s.status == 'pending']),
                'cancelled_scales': len([s for s in scales if s.status == 'cancelled'])
            }
            
            dates_summary = {}
            for scale in scales:
                # CORREÇÃO: Formatar a data como string simples YYYY-MM-DD
                if hasattr(scale.date, 'date'):  # Se for datetime, pegar apenas a parte da data
                    date_only = scale.date.date()
                    date_str = date_only.isoformat()  # Isso retorna YYYY-MM-DD
                else:
                    date_str = str(scale.date)  # Já é date ou string
                
                # Garantir que está no formato YYYY-MM-DD
                if 'T' in date_str:
                    date_str = date_str.split('T')[0]
                
                if date_str not in dates_summary:
                    dates_summary[date_str] = {
                        'date': date_str,
                        'status': scale.status,
                        'scale_id': scale.id,
                        'members_count': len(scale.get_members())
                    }
            
            return jsonify({
                'success': True,
                'data': {
                    'group_info': group_info,
                    'scales': scales_data,
                    'dates_summary': list(dates_summary.values()),
                    'statistics': {
                        'total': len(scales),
                        'confirmed': group_info['confirmed_scales'],
                        'pending': group_info['pending_scales'],
                        'cancelled': group_info['cancelled_scales']
                    }
                }
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.get_monthly_scale_group_details: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def update_monthly_scale_group(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            data = request.get_json()
            scale_group = data.get('scale_group')
            
            if not scale_group:
                return jsonify({'success': False, 'error': 'Grupo de escalas é obrigatório'}), 400
            
            scales = Scale.query.filter(Scale.scale_group == scale_group).all()
            if not scales:
                return jsonify({'success': False, 'error': 'Grupo de escalas não encontrado'}), 404
            
            first_scale = scales[0]
            user_permissions = current_user.get_permissions()
            can_edit_all = 'escala_edit_all' in user_permissions or 'all' in user_permissions
            
            can_edit = False
            if current_user.role == 'admin' or can_edit_all:
                can_edit = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(first_scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_edit = True
            elif first_scale.created_by == current_user_id:
                can_edit = True
            
            if not can_edit:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para editar estas escalas.'
                }), 403
            
            fields_to_update = ['event', 'description', 'time']
            updated_count = 0
            
            for scale in scales:
                updated = False
                
                for field in fields_to_update:
                    if field in data:
                        setattr(scale, field, data[field])
                        updated = True
                
                if 'members' in data:
                    scale.set_members(data['members'])
                    updated = True
                
                if 'songs' in data:
                    scale.set_songs(data['songs'])
                    updated = True
                
                if 'observations' in data:
                    scale.set_observations(data['observations'])
                    updated = True
                
                if updated:
                    scale.updated_at = datetime.utcnow()
                    updated_count += 1
            
            db.session.commit()
            
            notifications_created = 0
            whatsapp_sent = 0
            if 'members' in data:
                for scale in scales:
                    notifications_created += self._create_group_update_notifications(
                        scale, data['members'], current_user_id
                    )
                    # Enviar WhatsApp para novos membros
                    whatsapp_sent += self._send_whatsapp_for_updated_scale(scale, data['members'], current_user)
            
            return jsonify({
                'success': True,
                'data': {
                    'updated_scales': updated_count,
                    'notifications_created': notifications_created,
                    'whatsapp_sent': whatsapp_sent
                },
                'message': f'{updated_count} escalas atualizadas! {notifications_created} notificações e {whatsapp_sent} WhatsApp enviados.'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.update_monthly_scale_group: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def _send_whatsapp_for_updated_scale(self, scale, members_data, current_user):
        """Envia WhatsApp para membros quando a escala é atualizada"""
        whatsapp_sent = 0
        
        for member in members_data:
            member_id = member.get('id')
            
            if member_id == current_user.id:
                continue
            
            user = User.query.get(member_id)
            if user and hasattr(user, 'phone') and user.phone:
                # Preparar dados do membro
                member_data = {
                    'id': user.id,
                    'name': user.name,
                    'phone': user.phone,
                    'role': member.get('role', 'Participante')
                }
                music_key = ''
                # Enviar WhatsApp em thread separada usando a função auxiliar
                whatsapp_thread = threading.Thread(
                    target=self._send_whatsapp_with_context,
                    args=(member_data, scale.id,  music_key, scale.scale_type == 'monthly_group'),
                    daemon=True,
                    name=f"WhatsAppUpdate-{member_id}"
                )
                whatsapp_thread.start()
                whatsapp_sent += 1
        
        return whatsapp_sent

    def _create_group_update_notifications(self, scale, members_data, current_user_id):
        notifications_created = 0
        
        for member in members_data:
            member_id = member.get('id')
            
            if member_id == current_user_id:
                continue
            
            user = User.query.get(member_id)
            if user:
                scale_date = scale.date.strftime('%d/%m/%Y')
                
                notification = Notification(
                    user_id=member_id,
                    title='📅 Atualização na Escala',
                    message=f'A escala "{scale.event}" em {scale_date} foi atualizada',
                    type='scale_update',
                    data=json.dumps({
                        'scale_id': scale.id,
                        'scale_group': scale.scale_group,
                        'scale_event': scale.event,
                        'scale_date': scale_date,
                        'action': 'scale_updated'
                    }),
                    is_read=False,
                    created_at=datetime.utcnow()
                )
                
                db.session.add(notification)
                notifications_created += 1
        
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao salvar notificações: {str(e)}")
        
        return notifications_created
    
    @jwt_required()
    def check_date_availability(self):
        try:
            data = request.get_json()
            date_str = data.get('date')
            ministry_id = data.get('ministry_id')
            
            if not date_str or not ministry_id:
                return jsonify({'success': False, 'error': 'Data e ministério são obrigatórios'}), 400
            
            scale_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            
            existing_scale = Scale.query.filter(
                Scale.date == scale_date,
                Scale.ministry_id == ministry_id
            ).first()
            
            is_available = existing_scale is None
            
            response_data = {
                'date': date_str,
                'ministry_id': ministry_id,
                'is_available': is_available
            }
            
            if existing_scale:
                response_data['existing_scale'] = {
                    'id': existing_scale.id,
                    'event': existing_scale.event,
                    'time': existing_scale.time,
                    'status': existing_scale.status,
                    'scale_type': existing_scale.scale_type
                }
            
            return jsonify({
                'success': True,
                'data': response_data
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.check_date_availability: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def get_month_calendar(self):
        try:
            data = request.get_json()
            month_year = data.get('month_year')
            ministry_id = data.get('ministry_id')
            
            if not month_year or not ministry_id:
                return jsonify({'success': False, 'error': 'Mês e ministério são obrigatórios'}), 400
            
            month_date = datetime.strptime(month_year + '-01', '%Y-%m-%d')
            year = month_date.year
            month = month_date.month
            
            num_days = calendar.monthrange(year, month)[1]
            
            start_date = datetime(year, month, 1).date()
            end_date = datetime(year, month, num_days).date()
            
            existing_scales = Scale.query.filter(
                Scale.ministry_id == ministry_id,
                Scale.date >= start_date,
                Scale.date <= end_date
            ).all()
            
            occupied_dates = {}
            for scale in existing_scales:
                date_str = scale.date.isoformat()
                occupied_dates[date_str] = {
                    'scale_id': scale.id,
                    'event': scale.event,
                    'time': scale.time,
                    'status': scale.status,
                    'scale_type': scale.scale_type,
                    'scale_group': scale.scale_group
                }
            
            calendar_data = []
            for day in range(1, num_days + 1):
                current_date = datetime(year, month, day).date()
                date_str = current_date.isoformat()
                
                is_occupied = date_str in occupied_dates
                is_today = current_date == datetime.now().date()
                is_past = current_date < datetime.now().date()
                
                calendar_data.append({
                    'date': date_str,
                    'day': day,
                    'day_of_week': current_date.weekday(),
                    'day_name': ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][current_date.weekday()],
                    'is_occupied': is_occupied,
                    'is_today': is_today,
                    'is_past': is_past,
                    'event': occupied_dates.get(date_str, {}).get('event'),
                    'time': occupied_dates.get(date_str, {}).get('time'),
                    'status': occupied_dates.get(date_str, {}).get('status'),
                    'scale_type': occupied_dates.get(date_str, {}).get('scale_type')
                })
            
            return jsonify({
                'success': True,
                'data': {
                    'month': month,
                    'year': year,
                    'month_name': month_date.strftime('%B'),
                    'calendar': calendar_data,
                    'occupied_count': len(occupied_dates),
                    'available_count': num_days - len(occupied_dates)
                }
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.get_month_calendar: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def update(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            user_permissions = current_user.get_permissions()
            can_edit_all_scales = 'escala_edit_all' in user_permissions or 'all' in user_permissions
            
            data = request.get_json()
            scale_id = data.get('id')
            
            if not scale_id:
                return jsonify({'success': False, 'error': 'ID da escala é obrigatório'}), 400
            
            scale = Scale.query.get(scale_id)
            if not scale:
                return jsonify({'success': False, 'error': 'Escala não encontrada'}), 404
            
            can_edit = False
            
            if current_user.role == 'admin':
                can_edit = True
            elif can_edit_all_scales:
                can_edit = True
            elif scale.created_by == current_user_id:
                can_edit = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_edit = True
            
            if not can_edit:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para editar esta escala.'
                }), 403
            
            old_members = scale.get_members()
            old_member_ids = [member.get('id') for member in old_members]
            
            if 'event' in data:
                scale.event = data['event']
            if 'date' in data:
                new_date = datetime.strptime(data['date'], '%Y-%m-%d').date()
                
                # VERIFICAR SE A NOVA DATA JÁ ESTÁ OCUPADA (exceto para esta mesma escala)
                if new_date != scale.date:
                    existing_scale = Scale.query.filter(
                        Scale.date == new_date,
                        Scale.ministry_id == scale.ministry_id,
                        Scale.id != scale.id
                    ).first()
                    
                    if existing_scale:
                        return jsonify({
                            'success': False, 
                            'error': f'Já existe uma escala ({existing_scale.event}) para esta data e ministério.'
                        }), 400
                
                scale.date = new_date
            if 'time' in data:
                scale.time = data['time']
            if 'ministry' in data:
                new_ministry_id = data['ministry']
                
                # Verificar permissão para o novo ministério
                if current_user.role != 'admin' and not can_edit_all_scales:
                    new_ministry = Ministry.query.get(new_ministry_id)
                    if not new_ministry:
                        return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
                    
                    if new_ministry.leader_id != current_user.id:
                        user_ministries = current_user.get_ministries() or []
                        if new_ministry_id not in user_ministries:
                            return jsonify({
                                'success': False, 
                                'error': 'Acesso negado. Você não tem acesso ao ministério selecionado.'
                            }), 403
                
                scale.ministry_id = new_ministry_id
            
            if 'description' in data:
                scale.description = data['description']
            if 'status' in data:
                scale.status = data['status']
            if 'members' in data:
                scale.set_members(data['members'])
            if 'songs' in data:
                scale.set_songs(data['songs'])
            if 'observations' in data:
                scale.set_observations(data['observations'])
            
            scale.updated_at = datetime.utcnow()
            
            db.session.commit()
            
            new_members = scale.get_members()
            new_member_ids = [member.get('id') for member in new_members]
            
            added_member_ids = [mid for mid in new_member_ids if mid not in old_member_ids]
            
            notifications_created = 0
            whatsapp_sent = 0
            if added_member_ids:
                notifications_created = self._create_notifications_for_members(scale, added_member_ids, current_user)
                whatsapp_sent = self._send_whatsapp_for_new_members(scale, added_member_ids, current_user)
            
            return jsonify({
                'success': True,
                'data': {
                    'scale': scale.to_dict(),
                    'notifications_created': notifications_created,
                    'whatsapp_sent': whatsapp_sent
                },
                'message': f'Escala atualizada! {notifications_created} notificações e {whatsapp_sent} WhatsApp enviados.'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.update: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def _send_whatsapp_for_new_members(self, scale, added_member_ids, current_user):
        """Envia WhatsApp para novos membros adicionados à escala"""
        whatsapp_sent = 0
        
        all_members = scale.get_members()
        member_roles = {member.get('id'): member.get('role', 'Participante') for member in all_members}
        
        for member_id in added_member_ids:
            if member_id == current_user.id:
                continue
            
            user = User.query.get(member_id)
            if user and hasattr(user, 'phone') and user.phone:
                # Preparar dados do membro
                member_data = {
                    'id': user.id,
                    'name': user.name,
                    'phone': user.phone,
                    'role': member_roles.get(member_id, 'Participante')
                }
                music_key = ''
                # Enviar WhatsApp em thread separada usando a função auxiliar
                whatsapp_thread = threading.Thread(
                    target=self._send_whatsapp_with_context,
                    args=(member_data, scale.id, music_key, scale.scale_type == 'monthly_group'),
                    daemon=True,
                    name=f"WhatsAppNew-{member_id}"
                )
                whatsapp_thread.start()
                whatsapp_sent += 1
        
        return whatsapp_sent
    
    def _create_notifications_for_members(self, scale, member_ids, created_by_user):
        notifications_created = 0
        
        all_members = scale.get_members()
        member_roles = {member.get('id'): member.get('role', 'Participante') for member in all_members}
        
        for member_id in member_ids:
            if member_id == created_by_user.id:
                continue
            
            user = User.query.get(member_id)
            if user:
                member_role = member_roles.get(member_id, 'Participante')
                scale_date = scale.date.strftime('%d/%m/%Y')
                
                notification = Notification(
                    user_id=member_id,
                    title='📅 Você foi adicionado à escala!',
                    message=f'Você foi adicionado à escala "{scale.event}" em {scale_date} às {scale.time} como {member_role}',
                    type='scale_update',
                    data=json.dumps({
                        'scale_id': scale.id,
                        'scale_event': scale.event,
                        'scale_date': scale_date,
                        'scale_time': scale.time,
                        'ministry_id': scale.ministry_id,
                        'role': member_role,
                        'action': 'added_to_scale'
                    }),
                    is_read=False,
                    created_at=datetime.utcnow()
                )
                
                db.session.add(notification)
                notifications_created += 1
        
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao salvar notificações: {str(e)}")
        
        return notifications_created
    
    @jwt_required()
    def delete(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            user_permissions = current_user.get_permissions()
            can_edit_all_scales = 'escala_edit_all' in user_permissions or 'all' in user_permissions
            
            data = request.get_json()
            scale_id = data.get('id')
            
            if not scale_id:
                return jsonify({'success': False, 'error': 'ID da escala é obrigatório'}), 400
            
            scale = Scale.query.get(scale_id)
            if not scale:
                return jsonify({'success': False, 'error': 'Escala não encontrada'}), 404
            
            can_delete = False
            
            if current_user.role == 'admin':
                can_delete = True
            elif can_edit_all_scales:
                can_delete = True
            elif scale.created_by == current_user_id:
                can_delete = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_delete = True
            
            if not can_delete:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para excluir esta escala.'
                }), 403
            
            db.session.delete(scale)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Escala excluída com sucesso!'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.delete: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def get_scale_by_id(self, scale_id):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            user_permissions = current_user.get_permissions()
            permitted_ministries = current_user.get_permitted_ministries()
            
            has_escala_view = 'escala_view' in user_permissions or 'all' in user_permissions
            if not has_escala_view:
                return jsonify({
                    'success': False, 
                    'error': 'Você não tem permissão para visualizar escalas'
                }), 403
            
            scale = Scale.query.get(scale_id)
            if not scale:
                return jsonify({'success': False, 'error': 'Escala não encontrada'}), 404
            
            can_view = False
            
            if current_user.role == 'admin':
                can_view = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_view = True
            else:
                scale_members = scale.get_members()
                if any(member.get('id') == current_user_id for member in scale_members):
                    can_view = True
                elif 'escala_view_all' in user_permissions:
                    allowed_ministries = permitted_ministries.get('escala_view_all', [])
                    if scale.ministry_id in allowed_ministries:
                        can_view = True
                else:
                    user_ministries = current_user.get_ministries() or []
                    if scale.ministry_id in user_ministries:
                        can_view = True
            
            if not can_view:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para visualizar esta escala.'
                }), 403
            
            return jsonify({
                'success': True,
                'data': {
                    'scale': scale.to_dict()
                }
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.get_scale_by_id: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def _check_scale_permission(self, user, scale, user_permissions, permitted_ministries):
        if user.role == 'admin':
            return True
        
        if user.role == 'lider':
            ministry = Ministry.query.get(scale.ministry_id)
            return ministry and ministry.leader_id == user.id
        
        scale_members = scale.get_members()
        if any(member.get('id') == user.id for member in scale_members):
            return True
        
        if 'escala_view_all' in user_permissions:
            allowed_ministries = permitted_ministries.get('escala_view_all', [])
            if scale.ministry_id in allowed_ministries:
                return True
        
        user_ministries = user.get_ministries() or []
        return scale.ministry_id in user_ministries


    def _send_test_email(self, recipient_email=None):
        """Envia e-mail de teste usando Homehost/Roundcube"""
        try:
            print(f"\n" + "="*70)
            print(f"🧪 TESTE DE CONEXÃO HOMEHOST")
            print("="*70)
            
            recipient_email = recipient_email or os.getenv('EMAIL_TEST_RECIPIENT', '')
            SMTP_SERVER = EMAIL_CONFIG['smtp_server']
            SMTP_PORT = EMAIL_CONFIG['smtp_port']
            SENDER_EMAIL = EMAIL_CONFIG['sender_email']
            SENDER_PASSWORD = EMAIL_CONFIG['sender_password']
            USE_TLS = EMAIL_CONFIG['use_tls']

            if not all([SMTP_SERVER, SENDER_EMAIL, SENDER_PASSWORD, recipient_email]):
                print("⚠️ Configuração de e-mail incompleta. Verifique SMTP_SERVER, EMAIL_SENDER, EMAIL_PASSWORD e EMAIL_TEST_RECIPIENT no .env")
                return False
            
            print(f"   Configuração:")
            print(f"   • Servidor: {SMTP_SERVER}:{SMTP_PORT}")
            print(f"   • Usuário: {SENDER_EMAIL}")
            print(f"   • TLS: {USE_TLS}")
            
            # Criar mensagem simples
            msg = MIMEMultipart()
            msg['From'] = f"Teste Sistema <{SENDER_EMAIL}>"
            msg['To'] = recipient_email
            msg['Subject'] = 'Teste de Configuração - Sistema de Escalas'
            
            current_time = datetime.now().strftime('%d/%m/%Y %H:%M:%S')
            
            html = f"""<html><body>
                <h2>✅ Teste de Configuração SMTP</h2>
                <p>Sistema de Escalas - {current_time}</p>
                <p>Este e-mail confirma que o sistema está configurado corretamente.</p>
                <p><strong>Servidor:</strong> {SMTP_SERVER}:{SMTP_PORT}</p>
            </body></html>"""
            
            msg.attach(MIMEText(html, 'html'))
            
            print(f"   🔗 Testando conexão...")
            
            try:
                # Conexão simples sem debug
                with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
                    
                    if USE_TLS:
                        server.starttls()
                    
                    server.login(SENDER_EMAIL, SENDER_PASSWORD)
                    server.send_message(msg)
                    
                    print(f"   ✅ E-mail aceito pelo servidor")
                    
            except smtplib.SMTPServerDisconnected as e:
                # Isso acontece quando o servidor aceita o e-mail mas fecha a conexão
                print(f"   ⚠️  Servidor desconectou após aceitar o e-mail")
                print(f"   📧 O e-mail provavelmente foi enviado com sucesso!")
                print(f"   ℹ️  Verifique a caixa de entrada de {recipient_email}")
                return True
                
            except Exception as e:
                print(f"   ❌ Erro: {type(e).__name__}: {e}")
                return False
            
            print("="*70)
            print(f"✅ TESTE CONCLUÍDO!")
            print(f"📧 E-mail enviado para: {recipient_email}")
            print("="*70)
            
            return True
            
        except Exception as e:
            print(f"❌ ERRO: {e}")
            return False


    def get_monthly_scale_group_for_edit(self, scale_group):
        """Método específico para edição - retorna dados formatados para o wizard"""
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            scales = Scale.query.filter(
                Scale.scale_group == scale_group
            ).order_by(Scale.date).all()
            print(scales)
            if not scales:
                return jsonify({'success': False, 'error': 'Grupo de escalas não encontrado'}), 404
            
            first_scale = scales[0]
            
            # Verificar permissões
            user_permissions = current_user.get_permissions()
            permitted_ministries = current_user.get_permitted_ministries()
            can_edit = self._check_scale_permission(current_user, first_scale, user_permissions, permitted_ministries)
            
            if not can_edit:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para editar estas escalas.'
                }), 403
            
            # Estruturar dados para o wizard
            wizard_data = {
                'scale_group': first_scale.scale_group,
                'month_reference': first_scale.month_reference,
                'event': first_scale.event,
                'ministry_id': first_scale.ministry_id,
                'time': first_scale.time,
                'description': first_scale.description,
                'dates': [],
                'selections': {}
            }
            
            # Coletar dados por data
            for scale in scales:
               
                # CORREÇÃO AQUI: Formatar data corretamente sem fuso horário
                if hasattr(scale.date, 'date'):
                    date_only = scale.date.date()
                    date_str = date_only.isoformat()  # YYYY-MM-DD
                    print("date only:", date_str)
                    print("date str:", date_str)
                elif hasattr(scale.date, 'isoformat'):
                    date_str = scale.date.isoformat()
                    if 'T' in date_str:
                        date_str = date_str.split('T')[0]  # Remover hora
                else:
                    date_str = str(scale.date)
                    # Limpar se tiver hora
                    if ' ' in date_str:
                        date_str = date_str.split(' ')[0]
                    elif 'T' in date_str:
                        date_str = date_str.split('T')[0]

                # Adicionar à lista de datas
                wizard_data['dates'].append(date_str)
                
                # Membros para esta data
                members_data = {}
                for member in scale.get_members():
                    if isinstance(member, dict):
                        member_id = member.get('id')
                        if member_id:
                            members_data[str(member_id)] = {
                                'id': member_id,
                                'function_id': member.get('function_id') or member.get('role_id'),
                                'role': member.get('role') or member.get('function') or 'Participante',
                                'status': member.get('status', 'pending')
                            }
                
                # Músicas para esta data (se houver)
                songs_data = []
                if hasattr(scale, 'get_songs'):
                    try:
                        songs_data = scale.get_songs()
                    except:
                        songs_data = []
                
                wizard_data['selections'][date_str] = {
                    'time': scale.time,
                    'description': scale.description or '',
                    'members': members_data,
                    'songs': songs_data,
                    'music_key': getattr(scale, 'music_key', '') or '',
                    'observations': getattr(scale, 'observations', []) or [],
                    'send_lyrics': getattr(scale, 'send_lyrics', True)
                }
            
            return jsonify({
                'success': True,
                'data': wizard_data
            })
            
        except Exception as e:
            print(f"Erro no ScaleController.get_monthly_scale_group_for_edit: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    

    @jwt_required()
    def update_monthly_scale_group_with_details(self):
        """Atualização completa de grupo mensal com todos os detalhes"""
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            data = request.get_json()
            scale_group = data.get('scale_group')
            
            if not scale_group:
                return jsonify({'success': False, 'error': 'Grupo de escalas é obrigatório'}), 400
            
            # Buscar escalas existentes
            existing_scales = Scale.query.filter(Scale.scale_group == scale_group).all()
            
            if not existing_scales:
                return jsonify({'success': False, 'error': 'Grupo de escalas não encontrado'}), 404
            
            first_scale = existing_scales[0]
            
            # Verificar permissões
            user_permissions = current_user.get_permissions()
            can_edit_all = 'escala_edit_all' in user_permissions or 'all' in user_permissions
            
            can_edit = False
            if current_user.role == 'admin' or can_edit_all:
                can_edit = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(first_scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_edit = True
            elif first_scale.created_by == current_user_id:
                can_edit = True
            
            if not can_edit:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para editar estas escalas.'
                }), 403
            
            # Atualizar informações gerais
            updated_count = 0
            
            # Processar atualizações por data
            dates_updates = data.get('dates_updates', [])
            
            for date_update in dates_updates:
                date_str = date_update.get('date')
                if not date_str:
                    continue
                
                # Buscar escala para esta data
                scale = next((s for s in existing_scales if str(s.date) == date_str), None)
                
                if not scale:
                    # Criar nova escala para esta data (se for permitido adicionar)
                    print(f"⚠️ Data {date_str} não encontrada, criando nova...")
                    continue
                
                # Atualizar campos básicos
                if 'event' in data:
                    scale.event = data['event']
                if 'description' in data:
                    scale.description = data.get('description')
                if 'time' in date_update:
                    scale.time = date_update['time']
                
                # Atualizar descrição específica da data
                if 'description' in date_update:
                    scale.description = date_update['description']
                
                # Atualizar membros
                if 'members' in date_update:
                    scale.set_members(date_update['members'])
                
                # Atualizar músicas (se houver)
                if 'songs' in date_update and date_update['songs']:
                    print(f"🎵 Atualizando {len(date_update['songs'])} músicas para {date_str}")
                    scale.set_songs(date_update['songs'])
                
                # Atualizar tom musical (se houver)
                if 'music_key' in date_update:
                    scale.music_key = date_update['music_key']
                
                # Atualizar opção de enviar letra/cifra
                if 'send_lyrics' in date_update:
                    scale.send_lyrics = date_update['send_lyrics']
                
                # Atualizar observações
                if 'observations' in date_update:
                    scale.set_observations(date_update['observations'])
                
                scale.updated_at = datetime.utcnow()
                updated_count += 1
            
            # Processar datas para remover
            dates_to_remove = data.get('dates_to_remove', [])
            removed_count = 0
            for date_str in dates_to_remove:
                scale_to_remove = next((s for s in existing_scales if str(s.date) == date_str), None)
                if scale_to_remove:
                    db.session.delete(scale_to_remove)
                    removed_count += 1
            
            db.session.commit()
            
            # Criar notificações para membros
            notifications_created = 0
            for date_update in dates_updates:
                if 'members' in date_update and date_update['members']:
                    scale_for_notification = next(
                        (s for s in existing_scales if str(s.date) == date_update.get('date')), 
                        None
                    )
                    if scale_for_notification:
                        notifications_created += self._create_group_update_notifications(
                            scale_for_notification, 
                            date_update['members'], 
                            current_user_id
                        )
            
            return jsonify({
                'success': True,
                'data': {
                    'updated_scales': updated_count,
                    'removed_scales': removed_count,
                    'notifications_created': notifications_created,
                    'total_dates': len(dates_updates)
                },
                'message': f'{updated_count} escala(s) atualizada(s)! {removed_count} removida(s).'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.update_monthly_scale_group_with_details: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    def update_monthly_scale_group_v2(self):
        """Atualização melhorada para grupos mensais"""
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            data = request.get_json()
            scale_group = data.get('scale_group')
            
            if not scale_group:
                return jsonify({'success': False, 'error': 'Grupo de escalas é obrigatório'}), 400
            
            # Buscar escalas existentes
            existing_scales = Scale.query.filter(Scale.scale_group == scale_group).all()
            
            if not existing_scales:
                return jsonify({'success': False, 'error': 'Grupo de escalas não encontrado'}), 404
            
            first_scale = existing_scales[0]
            
            # Verificar permissões
            user_permissions = current_user.get_permissions()
            can_edit_all = 'escala_edit_all' in user_permissions or 'all' in user_permissions
            
            can_edit = False
            if current_user.role == 'admin' or can_edit_all:
                can_edit = True
            elif current_user.role == 'lider':
                ministry = Ministry.query.get(first_scale.ministry_id)
                if ministry and ministry.leader_id == current_user_id:
                    can_edit = True
            elif first_scale.created_by == current_user_id:
                can_edit = True
            
            if not can_edit:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para editar estas escalas.'
                }), 403
            
            # Atualizar informações gerais
            updated_count = 0
            fields_to_update = ['event', 'description', 'time']
            
            for scale in existing_scales:
                for field in fields_to_update:
                    if field in data:
                        setattr(scale, field, data[field])
                
                # Atualizar membros (se fornecido)
                if 'members' in data and data['members']:
                    scale.set_members(data['members'])
                
                # Atualizar músicas (se fornecido)
                if 'songs' in data:
                    scale.set_songs(data['songs'])
                
                # Atualizar observações (se fornecido)
                if 'observations' in data:
                    scale.set_observations(data['observations'])
                
                scale.updated_at = datetime.utcnow()
                updated_count += 1
            
            # Lidar com datas removidas (se fornecido)
            dates_to_remove = data.get('dates_to_remove', [])
            if dates_to_remove:
                for date_str in dates_to_remove:
                    scale_to_remove = Scale.query.filter(
                        Scale.scale_group == scale_group,
                        Scale.date == date_str
                    ).first()
                    if scale_to_remove:
                        db.session.delete(scale_to_remove)
            
            db.session.commit()
            
            # Criar notificações
            notifications_created = 0
            if 'members' in data and data['members']:
                for scale in existing_scales:
                    notifications_created += self._create_group_update_notifications(
                        scale, data['members'], current_user_id
                    )
            
            return jsonify({
                'success': True,
                'data': {
                    'updated_scales': updated_count,
                    'removed_scales': len(dates_to_remove),
                    'notifications_created': notifications_created
                },
                'message': f'{updated_count} escalas atualizadas! {len(dates_to_remove)} removidas.'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no ScaleController.update_monthly_scale_group_v2: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500       

# Instância do controller
scale_controller = ScaleController()
