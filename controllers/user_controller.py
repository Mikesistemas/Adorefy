from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, User, Ministry
from datetime import datetime
import re
import random
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
import socket
import time
import atexit

EMAIL_CONFIG = {
    'smtp_server': os.getenv('SMTP_SERVER', ''),
    'smtp_port': int(os.getenv('SMTP_PORT', 587)),
    'sender_email': os.getenv('EMAIL_SENDER', ''),
    'sender_password': os.getenv('EMAIL_PASSWORD', ''),
    'use_tls': os.getenv('SMTP_USE_TLS', 'true').lower() == 'true'
}   

class UserController:

    # ----------------------------------------------------------
    # GET ALL USERS
    # ----------------------------------------------------------
    @jwt_required()
    def get_all(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            user_permissions = current_user.get_permissions()
            can_manage_all = (
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )

            if can_manage_all:
                users = User.query.filter_by(is_active=True).all()
            else:
                users = [current_user]

            return jsonify({
                'success': True,
                'data': {'users': [u.to_dict() for u in users]}
            })

        except Exception as e:
            print("Erro no UserController.get_all:", e)
            return jsonify({'success': False, 'error': str(e)}), 500

    
    def _send_welcome_email_thread(self, user_data, ministry_ids):
        """Thread para envio de e-mail de boas-vindas em background"""
        MAX_RETRIES = 3
        
        for attempt in range(MAX_RETRIES):
            try:
                print(f"\n📧 ENVIO DE E-MAIL - Tentativa {attempt + 1}/{MAX_RETRIES} - Usuário {user_data['id']}")
                
                # Importar dentro da thread
                from app import create_app
                
                # Criar app Flask para esta thread
                app = create_app()
                
                with app.app_context():
                    print(f"   Contexto Flask criado")
                    
                    # Pequena pausa
                    time.sleep(1)
                    
                    # Buscar usuário novamente
                    user = User.query.get(user_data['id'])
                    senha = user_data['senha']
                    if not user:
                        print(f"   ❌ Usuário não encontrado")
                        return
                    
                    # Buscar ministérios
                    ministries_info = []
                    if ministry_ids:
                        ministries = Ministry.query.filter(Ministry.id.in_(ministry_ids)).all()
                        for ministry in ministries:
                            leader_name = "Não definido"
                            if hasattr(ministry, 'leader_id') and ministry.leader_id:
                                leader = User.query.get(ministry.leader_id)
                                if leader:
                                    leader_name = leader.name
                            
                            ministries_info.append({
                                'name': ministry.name,
                                'leader': leader_name,
                                'description': ministry.description or "Ministério da igreja"
                            })
                    
                    print(f"   Usuário: {user.name}")
                    print(f"   E-mail: {user.email}")
                    print(f"   Ministérios: {len(ministries_info)}")
                    
                    # Configurações
                    SMTP_SERVER = EMAIL_CONFIG['smtp_server']
                    SMTP_PORT = EMAIL_CONFIG['smtp_port']
                    SENDER_EMAIL = EMAIL_CONFIG['sender_email']
                    SENDER_PASSWORD = EMAIL_CONFIG['sender_password']
                    USE_TLS = EMAIL_CONFIG['use_tls']
                    
                    # Validação
                    if not all([SMTP_SERVER, SENDER_EMAIL, SENDER_PASSWORD]):
                        print("   ❌ Configurações de e-mail incompletas")
                        return
                    
                    # Criar mensagem
                    msg = MIMEMultipart('related')
                    msg['From'] = f"Adorefy <{SENDER_EMAIL}>"
                    msg['To'] = user.email
                    msg['Subject'] = f"Bem-vindo(a) ao Adorefy - {user.name}"
                    
                    # Data atual
                    current_time = datetime.now().strftime('%d/%m/%Y %H:%M')
                    
                    # HTML simples do e-mail
                    html = f"""
                    <!DOCTYPE html>
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
                            }}
                            .header {{
                                background: #4f46e5;
                                color: white;
                                padding: 30px;
                                text-align: center;
                                border-radius: 10px 10px 0 0;
                            }}
                            .content {{
                                background: #f9fafb;
                                padding: 30px;
                                border: 1px solid #e5e7eb;
                            }}
                            .info-box {{
                                background: white;
                                border-left: 4px solid #4f46e5;
                                padding: 20px;
                                margin: 20px 0;
                                border-radius: 5px;
                            }}
                            .ministry-box {{
                                background: #f0f9ff;
                                border: 1px solid #7dd3fc;
                                padding: 15px;
                                margin: 10px 0;
                                border-radius: 5px;
                            }}
                            .footer {{
                                text-align: center;
                                color: #6b7280;
                                font-size: 12px;
                                margin-top: 30px;
                                padding-top: 20px;
                                border-top: 1px solid #e5e7eb;
                            }}
                            .highlight {{
                                background: #fef3c7;
                                padding: 15px;
                                margin: 20px 0;
                                border-radius: 5px;
                                border-left: 4px solid #f59e0b;
                            }}
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>🎉 Bem-vindo(a) ao Adorefy!</h1>
                            <p>Sistema de Gestão de Ministérios</p>
                        </div>
                        
                        <div class="content">
                            <h2>Olá, {user.name}!</h2>
                            <p>Sua conta foi criada com sucesso no sistema de gestão.</p>
                            
                            <div class="info-box">
                                <h3>📋 Seus Dados de Acesso</h3>
                                <p><strong>E-mail:</strong> {user.email}</p>
                                <p><strong>Senha inicial:</strong> {senha}</p>
                                <p><strong>Função:</strong> {user.role.capitalize() if user.role else 'Membro'}</p>
                            </div>
                            
                            <div class="info-box">
                                <h3>🔗 Como Acessar</h3>
                                <p>2. Use seu e-mail e senha inicial</p>
                            </div>
                            
                            {f'<h3>🏛️ Ministérios Vinculados</h3>' + ''.join([f'<div class="ministry-box"><h4>{m["name"]}</h4><p><strong>Líder:</strong> {m["leader"]}</p><p>{m["description"]}</p></div>' for m in ministries_info]) if ministries_info else ''}
                            
                            <div class="highlight">
                                <h4>✨ Funcionalidades Disponíveis:</h4>
                                <ul>
                                    <li>Visualizar escalas designadas</li>
                                    <li>Solicitar dispensa quando necessário</li>
                                    <li>Ver calendário de escalas</li>
                                </ul>
                            </div>
                            
                            
                            <div class="info-box" style="background: #fef3c7; border-left-color: #f59e0b;">
                                <h3>⚠️ Informações Importantes</h3>
                                <p>• Confirme indisponibilidade antecedência</p>
                                <p>• Comunique qualquer impedimento à liderança</p>
                            </div>
                        </div>
                        
                        <div class="footer">
                            <p><strong>Adorefy - desenvolvido por Mike</strong></p>
                            <p>Este é um e-mail automático - Não responda</p>
                            <p>Enviado em {current_time}</p>
                        </div>
                    </body>
                    </html>
                    """
                    
                    # Anexar HTML
                    msg_html = MIMEText(html, 'html')
                    msg.attach(msg_html)
                    
                    # Tentar enviar com retry
                    try:
                        print(f"   🔗 Conectando ao servidor SMTP...")
                        
                        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=30) as server:
                            server.set_debuglevel(1)
                            
                            if USE_TLS:
                                server.starttls()
                            
                            server.login(SENDER_EMAIL, SENDER_PASSWORD)
                            
                            print(f"   📤 Enviando e-mail...")
                            server.send_message(msg)
                            
                            print(f"   ✅ E-mail enviado para {user.email}")
                            return  # Sucesso - sai da função
                            
                    except smtplib.SMTPServerDisconnected as e:
                        print(f"   ⚠️ Servidor desconectado: {e}")
                        
                    except smtplib.SMTPAuthenticationError as e:
                        print(f"   ❌ Erro de autenticação: {e}")
                        return  # Não tente novamente se for erro de auth
                        
                    except (smtplib.SMTPException, ConnectionError, socket.timeout) as e:
                        print(f"   ⚠️ Erro de conexão (tentativa {attempt + 1}): {e}")
                        
                    # Espera antes de tentar novamente
                    if attempt < MAX_RETRIES - 1:
                        wait_time = 2 * (attempt + 1)
                        print(f"   ⏳ Aguardando {wait_time}s antes da próxima tentativa...")
                        time.sleep(wait_time)
                
                print(f"   🧵 Thread finalizada")
                
            except Exception as e:
                print(f"   ❌ ERRO na thread: {type(e).__name__}: {e}")
                if attempt == MAX_RETRIES - 1:
                    import traceback
                    traceback.print_exc()
        
        print(f"   ❌ Falha após {MAX_RETRIES} tentativas")


    # ----------------------------------------------------------
    # CREATE USER
    # ----------------------------------------------------------
    @jwt_required()
    def create(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            # Verificar se é líder
            user_permissions = current_user.get_permissions()
            can_manage = (
                'membros_gerenciar' in user_permissions or
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )

            if not can_manage or current_user.role not in ["admin", "lider"]:
                return jsonify({
                    'success': False,
                    'error': 'Apenas líderes ou administradores podem criar membros.'
                }), 403

            data = request.get_json()
            
            # Validação de campos obrigatórios
            required_fields = ["name", "email", "role"]
            for field in required_fields:
                if not data.get(field) or not isinstance(data[field], str) or not data[field].strip():
                    return jsonify({'success': False, 'error': f"Campo {field} é obrigatório"}), 400

            # Sanitização e validação dos dados
            name = data['name'].strip()
            email = data['email'].strip().lower()
            phone = data.get('phone', '').strip()
            role = data['role'].strip()

            # Validações específicas
            if len(name) < 2 or len(name) > 100:
                return jsonify({'success': False, 'error': "Nome deve ter entre 2 e 100 caracteres"}), 400

            if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
                return jsonify({'success': False, 'error': "Email inválido"}), 400

            if phone and not re.match(r'^[\d\s\(\)\-\+]{10,20}$', phone):
                return jsonify({'success': False, 'error': "Telefone inválido"}), 400

            if role not in ["admin", "lider", "membro"]:
                return jsonify({'success': False, 'error': "Função inválida"}), 400

            # Verificar email duplicado
            if User.query.filter_by(email=email).first():
                return jsonify({'success': False, 'error': 'Email já cadastrado'}), 400

            # Validação de skills
            skills = data.get("skills", [])
            if skills and not isinstance(skills, list):
                return jsonify({'success': False, 'error': "Skills deve ser uma lista"}), 400
            
            # Limitar tamanho das skills
            skills = [skill.strip()[:50] for skill in skills if isinstance(skill, str) and skill.strip()]

            # ✅ CORREÇÃO IMPORTANTE: OBTER MINISTÉRIOS DO LÍDER ATUAL
            ministries_to_add = data.get("ministries", [])
            
            # Se não foram especificados ministérios E o criador é líder (não admin)
            if not ministries_to_add and current_user.role == "lider" and current_user.led_ministries:
                # Automatizar: adicionar aos ministérios que o líder lidera
                ministries_to_add = [m.id for m in current_user.led_ministries]
                print(f"✅ Líder {current_user.name} está criando membro. Ministérios automáticos: {ministries_to_add}")
            
            # Se é admin criando, usar os ministérios especificados ou vazio
            elif not ministries_to_add and current_user.role == "admin":
                ministries_to_add = []  # Admin pode criar sem ministério
            
            # Se foram especificados ministérios, usar esses
            if not isinstance(ministries_to_add, list):
                return jsonify({'success': False, 'error': "Ministérios deve ser uma lista"}), 400

            # Filtrar ministries válidos
            valid_ministries = Ministry.query.filter(
                Ministry.id.in_([m for m in ministries_to_add if isinstance(m, int) and m > 0])
            ).all()
            valid_ministry_ids = [m.id for m in valid_ministries]

            # Se é líder (não admin), garantir que só pode adicionar aos seus ministérios
            if current_user.role == "lider":
                current_user_ministry_ids = [m.id for m in current_user.led_ministries]
                # Filtrar apenas os ministérios que ele lidera
                valid_ministry_ids = [m for m in valid_ministry_ids if m in current_user_ministry_ids]
                
                # Se após filtrar não sobrou nenhum, adicionar ao primeiro ministério que ele lidera
                if not valid_ministry_ids and current_user_ministry_ids:
                    valid_ministry_ids = [current_user_ministry_ids[0]]
                    print(f"⚠️ Nenhum ministério válido especificado. Adicionando ao primeiro ministério do líder: {valid_ministry_ids[0]}")

            # Criar usuário
            user = User(
                name=name,
                email=email,
                phone=phone,
                role=role,
                is_active=True
            )
            
            # GERAR SENHA ALEATÓRIA
            first_name = name.split()[0].lower() if name.split() else "user"
            random_suffix = str(random.randint(100, 999))
            default_password = f"{first_name}{random_suffix}@igreja"
            
            user.set_password(default_password)
            
            user.set_skills(skills)
            user.set_ministries(valid_ministry_ids)
            
            # PERMISSÕES
            permissions = ["escala_view"]
            if user.role in ["lider", "admin"]:
                permissions += ["escala_create", "escala_view_all", "membros_gerenciar", "musicas_gerenciar", "ministerios_gerenciar"]
            
            if user.role == "admin":
                permissions += ["membros_gerenciar_all", "ministerios_gerenciar", "all"]
            
            user.set_permissions(permissions)
            
            db.session.add(user)
            db.session.flush()  # Para obter o ID do usuário
            
            # ✅ CORREÇÃO: SE O NOVO USUÁRIO É LÍDER, DEFINIR COMO LÍDER DOS SEUS MINISTÉRIOS
            if user.role == "lider" and valid_ministry_ids:
                for ministry_id in valid_ministry_ids:
                    ministry = Ministry.query.get(ministry_id)
                    if ministry:
                        # Definir este usuário como líder do ministério
                        ministry.leader_id = user.id
                        
                        # Garantir que está nos membros
                        current_members = ministry.get_members() or []
                        if user.id not in current_members:
                            current_members.append(user.id)
                            ministry.set_members(current_members)
                            print(f"✅ Novo líder {user.id} definido como líder e adicionado como membro do ministério {ministry_id}")
            
            # ✅ CORREÇÃO: ADICIONAR O MEMBRO AOS MINISTÉRIOS (se ainda não estiver)
            for ministry_id in valid_ministry_ids:
                ministry = Ministry.query.get(ministry_id)
                if ministry:
                    current_members = ministry.get_members() or []
                    if user.id not in current_members:
                        current_members.append(user.id)
                        ministry.set_members(current_members)
                        print(f"✅ Membro {user.id} adicionado ao ministério {ministry_id}")
            
            db.session.commit()
            
            # Log
            print(f"✅ Novo membro criado por {current_user.name} (ID: {current_user.id})")
            print(f"   - Email: {email}")
            print(f"   - Senha padrão: {default_password}")
            print(f"   - Ministérios: {valid_ministry_ids}")
            print(f"   - Criado por líder dos ministérios: {[m.id for m in current_user.led_ministries]}")
            
            # ✅ CORREÇÃO: ENVIAR E-MAIL DE BOAS-VINDAS (em thread separada seguindo o mesmo padrão)
            try:
                import threading
                
                # Prepara dados para a thread
                user_data = {
                    'id': user.id,
                    'name': user.name,
                    'email': user.email,
                    'senha': default_password,
                    'role': user.role
                }
                
                # Iniciar thread para envio de e-mail seguindo o mesmo padrão das escalas
                email_thread = threading.Thread(
                    target=self._send_welcome_email_thread,
                    args=(user_data, valid_ministry_ids)
                )
                email_thread.daemon = True  # Thread morre quando o programa principal morre
                email_thread.start()
                
                print(f"🔄 Thread de e-mail de boas-vindas iniciada para {user.email}")
                
            except Exception as e:
                print(f"⚠️ Erro ao iniciar thread de e-mail (não crítico): {e}")
                import traceback
                traceback.print_exc()
            
            return jsonify({
                'success': True,
                'data': {'user': user.to_dict()},
                'message': 'Membro criado com sucesso! E-mail de boas-vindas será enviado em breve.'
            })
            
        except Exception as e:
            db.session.rollback()
            print("❌ Erro no UserController.create:", str(e))
            import traceback
            traceback.print_exc()
            return jsonify({'success': False, 'error': 'Erro interno do servidor'}), 500
                
               
    @jwt_required()
    def update(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            data = request.get_json()
    
            user_id = data.get("id")
            if not user_id:
                return jsonify({'success': False, 'error': 'ID do usuário é obrigatório'}), 400
    
            user_to_update = User.query.get(user_id)
            if not user_to_update:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
    
            user_permissions = current_user.get_permissions()
            can_manage = (
                'membros_gerenciar' in user_permissions or
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )
    
            # Pode editar a si mesmo OU ter permissão
            if user_to_update.id != current_user_id and not can_manage:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
    
            if current_user.role not in ["admin", "lider"]:
                return jsonify({
                    'success': False,
                    'error': 'Apenas líderes e administradores podem editar membros.'
                }), 403
    
            # Campos
            old_role = user_to_update.role
            
            if 'name' in data:
                user_to_update.name = data['name']
    
            if 'email' in data:
                exists = User.query.filter_by(email=data['email']).first()
                if exists and exists.id != user_to_update.id:
                    return jsonify({'success': False, 'error': 'Email já está em uso'}), 400
                user_to_update.email = data['email']
    
            if 'phone' in data:
                user_to_update.phone = data['phone']
    
            if 'role' in data and can_manage:
                user_to_update.role = data['role']
                
                # ✅ CORREÇÃO: SE MUDOU PARA LÍDER, DEFINIR COMO LÍDER DOS SEUS MINISTÉRIOS
                if data['role'] == 'lider' and old_role != 'lider':
                    # Obter IDs dos ministérios do usuário
                    user_ministry_ids = user_to_update.get_ministries() or []
                    
                    for ministry_id in user_ministry_ids:
                        ministry = Ministry.query.get(ministry_id)
                        if ministry:
                            # Definir como líder
                            ministry.leader_id = user_to_update.id
                            
                            # Garantir que está nos membros
                            current_members = ministry.get_members() or []
                            if user_to_update.id not in current_members:
                                current_members.append(user_to_update.id)
                                ministry.set_members(current_members)
                                print(f"✅ Usuário {user_to_update.id} promovido a líder do ministério {ministry.id}")
    
            if 'skills' in data:
                user_to_update.set_skills(data['skills'])
    
            if 'ministries' in data and can_manage:
                # Obter IDs antigos como números
                old_ministry_ids = user_to_update.get_ministries() or []
                new_ministry_ids = [int(mid) for mid in data['ministries'] if isinstance(mid, (int, str))]
                
                user_to_update.set_ministries(new_ministry_ids)
                
                # ✅ CORREÇÃO: SE É LÍDER E FOI ADICIONADO A NOVOS MINISTÉRIOS
                if user_to_update.role == 'lider':
                    for ministry_id in new_ministry_ids:
                        if ministry_id not in old_ministry_ids:  # Novo ministério
                            ministry = Ministry.query.get(ministry_id)
                            if ministry:
                                # Definir como líder
                                ministry.leader_id = user_to_update.id
                                
                                # Garantir que está nos membros
                                current_members = ministry.get_members() or []
                                if user_to_update.id not in current_members:
                                    current_members.append(user_to_update.id)
                                    ministry.set_members(current_members)
                                    print(f"✅ Líder {user_to_update.id} definido como líder do novo ministério {ministry_id}")
    
            if 'unavailability' in data:
                self._update_unavailability(user_to_update, data['unavailability'])
    
            # Atualizar permissões
            if can_manage:
                permissions = ["escala_view"]
                if user_to_update.role in ["lider", "admin"]:
                    permissions += ["escala_create", "escala_view_all", "membros_gerenciar"]
                if user_to_update.role == "admin":
                    permissions += ["membros_gerenciar_all", "ministerios_gerenciar", "all"]
    
                user_to_update.set_permissions(permissions)
    
            db.session.commit()
    
            return jsonify({
                'success': True,
                'data': {'user': user_to_update.to_dict()},
                'message': 'Membro atualizado com sucesso!'
            })
    
        except Exception as e:
            db.session.rollback()
            print("Erro no UserController.update:", e)
            return jsonify({'success': False, 'error': str(e)}), 500
    
    # ----------------------------------------------------------
    # INTERNAL: UPDATE UNAVAILABILITY
    # ----------------------------------------------------------
    def _update_unavailability(self, user, unavailability_data):
        from models import UnavailabilityRequest

        UnavailabilityRequest.query.filter_by(user_id=user.id).delete()

        for period in unavailability_data:
            req = UnavailabilityRequest(
                user_id=user.id,
                start_date=datetime.strptime(period['start'], '%Y-%m-%d').date(),
                end_date=datetime.strptime(period['end'], '%Y-%m-%d').date(),
                reason=period['reason'],
                status=period.get('status', 'pending')
            )
            db.session.add(req)

    # ----------------------------------------------------------
    # REQUEST UNAVAILABILITY
    # ----------------------------------------------------------
    @jwt_required()
    def request_unavailability(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            data = request.get_json()

            for f in ["start", "end", "reason"]:
                if not data.get(f):
                    return jsonify({'success': False, 'error': f"Campo {f} é obrigatório"}), 400

            from models import UnavailabilityRequest

            req = UnavailabilityRequest(
                user_id=current_user_id,
                start_date=datetime.strptime(data['start'], '%Y-%m-%d').date(),
                end_date=datetime.strptime(data['end'], '%Y-%m-%d').date(),
                reason=data['reason'],
                status='pending'
            )

            db.session.add(req)
            db.session.commit()

            return jsonify({
                'success': True,
                'data': {'unavailability': req.to_dict()},
                'message': 'Indisponibilidade enviada com sucesso!'
            })

        except Exception as e:
            db.session.rollback()
            print("Erro no UserController.request_unavailability:", e)
            return jsonify({'success': False, 'error': str(e)}), 500

    # ----------------------------------------------------------
    # GET CURRENT USER UNAVAILABILITY
    # ----------------------------------------------------------
    @jwt_required()
    def get_user_unavailability(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            from models import UnavailabilityRequest
            recs = UnavailabilityRequest.query.filter_by(user_id=current_user_id).all()

            return jsonify({
                'success': True,
                'data': {'unavailability': [r.to_dict() for r in recs]}
            })

        except Exception as e:
            print("Erro no UserController.get_user_unavailability:", e)
            return jsonify({'success': False, 'error': str(e)}), 500

    # ----------------------------------------------------------
    # MAIN FIXED METHOD — **THIS ONE WAS BROKEN**
    # ----------------------------------------------------------
    @jwt_required()
    def get_management_members(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            user_permissions = current_user.get_permissions()
            is_leader = (
                'membros_gerenciar' in user_permissions or
                'all' in user_permissions
            )

            ministry_id = request.args.get("ministry", type=int)
            users = []

            if ministry_id:
                if current_user.role != "admin":
                    allowed_ids = [m.id for m in current_user.led_ministries]
                    if ministry_id not in allowed_ids:
                        return jsonify({'success': False, 'error': 'Sem permissão para este ministério'}), 403

                ministry = Ministry.query.get(ministry_id)
                if not ministry:
                    return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404

                member_ids = ministry.get_members()
                users = User.query.filter(
                    User.id.in_(member_ids),
                    User.is_active == True
                ).all()

            else:
                if "all" in user_permissions:
                    users = User.query.filter_by(is_active=True).all()
                else:
                    lead_ministries = current_user.led_ministries
                    ids = set()
                    for m in lead_ministries:
                        ids.update(m.get_members())

                    users = User.query.filter(
                        User.id.in_(list(ids)),
                        User.is_active == True
                    ).all()

            return jsonify({
                'success': True,
                'data': {'users': [u.to_dict() for u in users]}
            })

        except Exception as e:
            print("Erro no UserController.get_management_members:", e)
            return jsonify({'success': False, 'error': 'Erro interno'}), 500

    # ----------------------------------------------------------
    # UPDATE USER MINISTRIES
    # ----------------------------------------------------------
    @jwt_required()
    def update_user_ministries(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            data = request.get_json()
            user_id = data.get("user_id")
            ministry_ids = data.get("ministry_ids", [])

            if not user_id:
                return jsonify({'success': False, 'error': 'ID do usuário é obrigatório'}), 400

            user_permissions = current_user.get_permissions()
            can_manage = (
                'membros_gerenciar' in user_permissions or
                'all' in user_permissions
            )

            if not can_manage:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403

            user_to_update = User.query.get(user_id)
            if not user_to_update:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            if "all" not in user_permissions:
                allowed = [m.id for m in current_user.led_ministries]
                for mid in ministry_ids:
                    if mid not in allowed:
                        return jsonify({'success': False, 'error': f'Permissão negada para o ministério {mid}'}), 403

            ministries = Ministry.query.filter(Ministry.id.in_(ministry_ids)).all()
            user_to_update.ministries = ministries

            db.session.commit()

            return jsonify({'success': True, 'message': 'Ministérios atualizados com sucesso!'})

        except Exception as e:
            db.session.rollback()
            print("Erro no UserController.update_user_ministries:", e)
            return jsonify({'success': False, 'error': str(e)}), 500
    

    @jwt_required()
    def get_user_by_id(self, user_id):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            user = User.query.get(user_id)
            if not user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            # Verificar permissões
            user_permissions = current_user.get_permissions()
            can_manage_all = (
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )

            # Se for o próprio usuário ou tem permissão de admin/líder
            if user_id == current_user_id or can_manage_all or current_user.role in ['admin', 'lider']:
                # Se for líder, verificar se o usuário está nos seus ministérios
                if current_user.role == 'lider' and not can_manage_all:
                    user_ministries = set(user.get_ministries() or [])
                    leader_ministries = set([m.id for m in current_user.led_ministries])
                    
                    if not user_ministries.intersection(leader_ministries):
                        return jsonify({'success': False, 'error': 'Permissão negada'}), 403

                return jsonify({
                    'success': True,
                    'data': {'user': user.to_dict()}
                })
            else:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403

        except Exception as e:
            print(f"❌ Erro no UserController.get_user_by_id: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    

    # ----------------------------------------------------------
    # UPDATE USER PERMISSIONS
    # ----------------------------------------------------------
    @jwt_required()
    def update_user_permissions(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            data = request.get_json()
            user_id = data.get('user_id')
            permissions = data.get('permissions', [])
            permitted_ministries = data.get('permitted_ministries', {})  # Novo: {permission: [ministry_ids]}
            
            if not user_id:
                return jsonify({'success': False, 'error': 'ID do usuário é obrigatório'}), 400
            
            user_to_update = User.query.get(user_id)
            if not user_to_update:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Verificar permissões do usuário atual
            user_permissions = current_user.get_permissions()
            can_manage_all = (
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )
            
            # Se é líder, só pode conceder permissões para seus ministérios
            permitted_ministry_ids = []
            if current_user.role == 'lider' and not can_manage_all:
                # Obter ministérios que o líder lidera
                led_ministries = Ministry.query.filter_by(leader_id=current_user_id).all()
                permitted_ministry_ids = [m.id for m in led_ministries]
                
                # Verificar se todas as permissões são para ministérios que ele lidera
                for permission, ministry_list in permitted_ministries.items():
                    for ministry_id in ministry_list:
                        if ministry_id not in permitted_ministry_ids:
                            return jsonify({
                                'success': False,
                                'error': f'Você só pode conceder permissões para seus próprios ministérios'
                            }), 403
            
            # Verificar se pode editar permissões
            can_edit = False
            if can_manage_all or current_user.role == 'admin':
                can_edit = True
            elif current_user.role == 'lider':
                # Líder só pode editar membros dos seus ministérios
                user_ministries = set(user_to_update.get_ministries() or [])
                leader_ministries = set([m.id for m in current_user.led_ministries])
                
                if user_ministries.intersection(leader_ministries):
                    can_edit = True
            
            if not can_edit:
                return jsonify({
                    'success': False,
                    'error': 'Permissão negada para editar este usuário'
                }), 403
            
            # Validar permissões
            valid_permissions = [
                'ministerios_gerenciar',
                'membros_gerenciar',
                'escala_view',
                'escala_view_all',
                'escala_create',
                'escala_edit_all',
                'musicas_gerenciar',
                'unavailability_approve',
                'month_scales',
                'all'
            ]
            
            for perm in permissions:
                if perm not in valid_permissions:
                    return jsonify({
                        'success': False,
                        'error': f'Permissão inválida: {perm}'
                    }), 400
            
            # Atualizar permissões
            user_to_update.set_permissions(permissions)
            
            # ✅ NOVO: Armazenar quais ministérios cada permissão se aplica
            if permitted_ministries:
                user_to_update.set_permitted_ministries(permitted_ministries)
            else:
                # Se não especificado, aplicar a todos os ministérios do usuário
                user_ministries = user_to_update.get_ministries() or []
                default_permitted = {}
                for perm in permissions:
                    if perm in ['escala_view_all', 'escala_create', 'escala_edit_all']:
                        default_permitted[perm] = user_ministries
                user_to_update.set_permitted_ministries(default_permitted)
            
            db.session.commit()
            
            print(f"🔐 Permissões atualizadas - Por: {current_user.name}")
            print(f"   - Usuário: {user_to_update.name}")
            print(f"   - Permissões: {permissions}")
            print(f"   - Ministérios permitidos: {permitted_ministries}")
            
            return jsonify({
                'success': True,
                'message': 'Permissões atualizadas com sucesso!',
                'data': {
                    'user': user_to_update.to_dict(),
                    'permitted_ministries': user_to_update.get_permitted_ministries()
                }
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"❌ Erro no update_user_permissions: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

# Instância
user_controller = UserController()

