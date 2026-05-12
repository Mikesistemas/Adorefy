from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, UnavailabilityRequest, User, Notification, Ministry
from datetime import datetime
import json

class UnavailabilityController:
    
    @jwt_required()
    def request_unavailability(self):
        try:
            user_id = get_jwt_identity()
            data = request.get_json()
            
            start_date = data.get('start')
            end_date = data.get('end')
            reason = data.get('reason')
            
            if not all([start_date, end_date, reason]):
                return jsonify({'success': False, 'error': 'Todos os campos são obrigatórios'}), 400
            
            # Create unavailability request
            request_obj = UnavailabilityRequest(
                user_id=user_id,
                start_date=datetime.strptime(start_date, '%Y-%m-%d').date(),
                end_date=datetime.strptime(end_date, '%Y-%m-%d').date(),
                reason=reason,
                status='pending'
            )
            
            db.session.add(request_obj)
            db.session.commit()
            
            # Notify only the leader of the member's ministry
            self._notify_ministry_leader(request_obj)
            
            return jsonify({
                'success': True,
                'data': {
                    'unavailability': request_obj.to_dict()
                },
                'message': 'Solicitação de indisponibilidade enviada com sucesso!'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no UnavailabilityController.request_unavailability: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def get_pending_requests(self):
        try:
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Verificar permissões
            user_permissions = user.get_permissions()
            permitted_ministries = user.get_permitted_ministries()
            
            # Verificar se tem permissão para ver solicitações
            can_view_all = 'unavailability_view_all' in user_permissions or 'all' in user_permissions
            can_view_own_ministry = 'unavailability_view' in user_permissions
            
            # Admin sempre pode ver tudo
            if user.role == 'admin':
                requests = UnavailabilityRequest.query.filter_by(status='pending').all()
            
            # Líder - ver solicitações apenas do seu ministério
            elif user.role == 'lider':
                # Obter ministérios que o usuário lidera
                led_ministries = Ministry.query.filter_by(leader_id=user_id).all()
                ministry_ids = [m.id for m in led_ministries]
                
                if ministry_ids:
                    # Obter membros dos ministérios liderados
                    member_ids = []
                    for ministry_id in ministry_ids:
                        ministry = Ministry.query.get(ministry_id)
                        if ministry:
                            # CORREÇÃO: Lidar com diferentes formatos de retorno de get_members()
                            members = ministry.get_members() or []
                            if members and isinstance(members, list):
                                for member in members:
                                    if isinstance(member, dict) and 'id' in member:
                                        member_ids.append(member['id'])
                                    elif isinstance(member, (int, str)):
                                        member_ids.append(int(member))
                    
                    # Filtrar solicitações dos membros
                    if member_ids:
                        requests = UnavailabilityRequest.query.filter(
                            UnavailabilityRequest.status == 'pending',
                            UnavailabilityRequest.user_id.in_(member_ids)
                        ).all()
                    else:
                        requests = []
                else:
                    requests = []
            
            # Membro comum com permissão específica
            elif can_view_all or can_view_own_ministry:
                # Se tem permissão para ver todas
                if can_view_all:
                    allowed_ministries = permitted_ministries.get('unavailability_view_all', [])
                    
                    if allowed_ministries:
                        # Obter membros dos ministérios permitidos
                        member_ids = []
                        for ministry_id in allowed_ministries:
                            ministry = Ministry.query.get(ministry_id)
                            if ministry:
                                # CORREÇÃO: Lidar com diferentes formatos de retorno de get_members()
                                members = ministry.get_members() or []
                                if members and isinstance(members, list):
                                    for member in members:
                                        if isinstance(member, dict) and 'id' in member:
                                            member_ids.append(member['id'])
                                        elif isinstance(member, (int, str)):
                                            member_ids.append(int(member))
                        
                        # Filtrar solicitações
                        if member_ids:
                            requests = UnavailabilityRequest.query.filter(
                                UnavailabilityRequest.status == 'pending',
                                UnavailabilityRequest.user_id.in_(member_ids)
                            ).all()
                        else:
                            requests = []
                    else:
                        requests = []
                # Se pode ver apenas do seu ministério
                elif can_view_own_ministry:
                    # Obter ministérios do usuário
                    user_ministries = user.get_ministries() or []
                    
                    member_ids = []
                    for ministry_id in user_ministries:
                        ministry = Ministry.query.get(ministry_id)
                        if ministry:
                            # CORREÇÃO: Lidar com diferentes formatos de retorno de get_members()
                            members = ministry.get_members() or []
                            if members and isinstance(members, list):
                                for member in members:
                                    if isinstance(member, dict) and 'id' in member:
                                        member_ids.append(member['id'])
                                    elif isinstance(member, (int, str)):
                                        member_ids.append(int(member))
                    
                    # Filtrar solicitações
                    if member_ids:
                        requests = UnavailabilityRequest.query.filter(
                            UnavailabilityRequest.status == 'pending',
                            UnavailabilityRequest.user_id.in_(member_ids)
                        ).all()
                    else:
                        requests = []
                else:
                    requests = []
            else:
                return jsonify({'success': False, 'error': 'Acesso não autorizado'}), 403
            
            requests_data = []
            for req in requests:
                user_data = User.query.get(req.user_id)
                requests_data.append({
                    'id': req.id,
                    'member_id': req.user_id,
                    'member_name': user_data.name if user_data else 'Usuário',
                    'member_email': user_data.email if user_data else '',
                    'member_phone': user_data.phone if user_data else '',
                    'start_date': req.start_date.isoformat(),
                    'end_date': req.end_date.isoformat(),
                    'reason': req.reason,
                    'status': req.status,
                    'created_at': req.created_at.isoformat()
                })
            
            print(f"✅ Usuário {user.name} ({user.role}) vendo {len(requests_data)} solicitações pendentes")
            
            return jsonify({
                'success': True,
                'data': {
                    'pending_requests': requests_data
                }
            })
            
        except Exception as e:
            print(f"Erro no get_pending_requests: {str(e)}")
            import traceback
            print(f"Traceback: {traceback.format_exc()}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def process_request(self):
        try:
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            data = request.get_json()
            
            request_id = data.get('requestId')
            action = data.get('action')  # 'approve' or 'reject'
            comment = data.get('comment')
            
            if not request_id or not action:
                return jsonify({'success': False, 'error': 'ID da solicitação e ação são obrigatórios'}), 400
            
            # Get request
            request_obj = UnavailabilityRequest.query.get(request_id)
            if not request_obj:
                return jsonify({'success': False, 'error': 'Solicitação não encontrada'}), 404
            
            # Verificar se o usuário pode processar esta solicitação
            can_process = False
            
            # Admin sempre pode processar
            if user.role == 'admin':
                can_process = True
            # Líder - verificar se é líder do ministério do membro
            elif user.role == 'lider':
                # Obter ministérios que o usuário lidera
                led_ministries = Ministry.query.filter_by(leader_id=user_id).all()
                ministry_ids = [m.id for m in led_ministries]
                
                # Verificar se o membro pertence a algum dos ministérios liderados
                if ministry_ids:
                    member_user = User.query.get(request_obj.user_id)
                    if member_user:
                        member_ministries = member_user.get_ministries() or []
                        # Verificar intersecção
                        for mid in member_ministries:
                            if mid in ministry_ids:
                                can_process = True
                                break
            
            # Membro comum - verificar permissões
            else:
                user_permissions = user.get_permissions()
                permitted_ministries = user.get_permitted_ministries()
                
                can_process_all = 'unavailability_process_all' in user_permissions or 'all' in user_permissions
                can_process_own = 'unavailability_process' in user_permissions
                
                if can_process_all:
                    # Verificar se tem permissão para este ministério específico
                    allowed_ministries = permitted_ministries.get('unavailability_process_all', [])
                    
                    if allowed_ministries:
                        member_user = User.query.get(request_obj.user_id)
                        if member_user:
                            member_ministries = member_user.get_ministries() or []
                            # Verificar intersecção
                            for mid in member_ministries:
                                if mid in allowed_ministries:
                                    can_process = True
                                    break
                    else:
                        can_process = True
                elif can_process_own:
                    # Verificar se o membro pertence ao mesmo ministério
                    user_ministries = user.get_ministries() or []
                    member_user = User.query.get(request_obj.user_id)
                    
                    if member_user and user_ministries:
                        member_ministries = member_user.get_ministries() or []
                        # Verificar intersecção
                        for mid in member_ministries:
                            if mid in user_ministries:
                                can_process = True
                                break
            
            if not can_process:
                return jsonify({
                    'success': False, 
                    'error': 'Acesso negado. Você não tem permissão para processar esta solicitação.'
                }), 403
            
            # Update request
            request_obj.status = 'approved' if action == 'approve' else 'rejected'
            request_obj.reviewed_by = user_id
            request_obj.reviewed_at = datetime.utcnow()
            request_obj.comment = comment
            
            db.session.commit()
            
            # Notify user about decision
            self._notify_user_decision(request_obj)
            
            return jsonify({
                'success': True,
                'message': f'Solicitação {action} com sucesso!'
            })
            
        except Exception as e:
            db.session.rollback()
            print(f"Erro no process_request: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def get_user_unavailability(self):
        try:
            user_id = get_jwt_identity()
            
            requests = UnavailabilityRequest.query.filter_by(user_id=user_id).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'unavailability': [req.to_dict() for req in requests]
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def _notify_ministry_leader(self, request_obj):
        """Notifica apenas o líder do ministério do membro"""
        user = User.query.get(request_obj.user_id)
        if not user:
            return
        
        # Obter ministérios do usuário
        user_ministries = user.get_ministries() or []
        
        leaders_to_notify = set()
        
        for ministry_id in user_ministries:
            ministry = Ministry.query.get(ministry_id)
            if ministry and ministry.leader_id:
                leaders_to_notify.add(ministry.leader_id)
        
        # Adicionar admins se necessário
        if len(leaders_to_notify) == 0:
            # Se não há líderes específicos, notificar admins
            admins = User.query.filter_by(role='admin').all()
            for admin in admins:
                leaders_to_notify.add(admin.id)
        
        # Criar notificações
        for leader_id in leaders_to_notify:
            # Verificar se o líder é o próprio usuário (evitar autnotificação)
            if leader_id == request_obj.user_id:
                continue
            
            notification_data = {
                'memberId': user.id,
                'requestId': request_obj.id,
                'startDate': request_obj.start_date.isoformat(),
                'endDate': request_obj.end_date.isoformat()
            }
            
            notification = Notification(
                user_id=leader_id,
                title='Nova solicitação de indisponibilidade',
                message=f'{user.name} solicitou indisponibilidade de {request_obj.start_date} até {request_obj.end_date}',
                type='unavailability_request',
                data=json.dumps(notification_data),
                is_read=False,
                created_at=datetime.utcnow()
            )
            db.session.add(notification)
        
        db.session.commit()
    
    def _notify_user_decision(self, request_obj):
        reviewer = User.query.get(request_obj.reviewed_by)
        action_text = 'aprovada' if request_obj.status == 'approved' else 'rejeitada'
        
        notification_data = {
            'requestId': request_obj.id,
            'status': request_obj.status,
            'comment': request_obj.comment
        }
        
        notification = Notification(
            user_id=request_obj.user_id,
            title='Solicitação de indisponibilidade processada',
            message=f'Sua solicitação de indisponibilidade foi {action_text} por {reviewer.name if reviewer else "um líder"}',
            type='unavailability_decision',
            data=json.dumps(notification_data),
            is_read=False,
            created_at=datetime.utcnow()
        )
        db.session.add(notification)
        db.session.commit()

# Crie uma instância do controller
unavailability_controller = UnavailabilityController()
