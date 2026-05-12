from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Notification, User
from datetime import datetime

class NotificationController:
    
    @jwt_required()
    def get_user_notifications(self):
        try:
            user_id = get_jwt_identity()
            
            notifications = Notification.query.filter_by(user_id=user_id).order_by(Notification.created_at.desc()).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'notifications': [notification.to_dict() for notification in notifications]
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def mark_as_read(self):
        try:
            user_id = get_jwt_identity()
            data = request.get_json()
            
            notification_id = data.get('id')
            if not notification_id:
                return jsonify({'success': False, 'error': 'ID da notificação é obrigatório'}), 400
            
            notification = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
            if not notification:
                return jsonify({'success': False, 'error': 'Notificação não encontrada'}), 404
            
            notification.is_read = True
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Notificação marcada como lida'
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def mark_all_as_read(self):
        try:
            user_id = get_jwt_identity()
            
            Notification.query.filter_by(user_id=user_id, is_read=False).update({'is_read': True})
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Todas as notificações marcadas como lidas'
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def clear_all(self):
        try:
            user_id = get_jwt_identity()
            
            Notification.query.filter_by(user_id=user_id).delete()
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Todas as notificações removidas'
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
            
    @jwt_required()
    def get_user_upcoming_scales(self):
        """Retorna as próximas escalas do usuário para mostrar na página inicial"""
        try:
            user_id = get_jwt_identity()
            current_user = User.query.get(user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Buscar todas as escalas
            all_scales = Scale.query.all()
            user_scales = []
            
            today = datetime.now().date()
            
            for scale in all_scales:
                try:
                    # Verificar se o usuário está na escala
                    scale_members = scale.get_members()
                    is_member = any(member.get('id') == user_id for member in scale_members)
                    
                    if is_member:
                        # Verificar se a escala é futura (não passada)
                        scale_date = scale.date
                        if scale_date >= today:  # Apenas escalas futuras ou de hoje
                            # Obter o papel do usuário na escala
                            user_role = next(
                                (member.get('role', 'Participante') for member in scale_members 
                                 if member.get('id') == user_id),
                                'Participante'
                            )
                            
                            # Obter informações do ministério
                            ministry = Ministry.query.get(scale.ministry_id)
                            ministry_name = ministry.name if ministry else 'Ministério'
                            
                            user_scales.append({
                                'id': scale.id,
                                'event': scale.event,
                                'date': scale_date.strftime('%d/%m/%Y'),
                                'time': scale.time,
                                'role': user_role,
                                'ministry': ministry_name,
                                'description': scale.description or '',
                                'status': scale.status,
                                'is_upcoming': True,
                                'days_until': (scale_date - today).days
                            })
                except Exception as e:
                    print(f"Erro ao processar escala {scale.id}: {e}")
                    continue
            
            # Ordenar por data mais próxima
            user_scales.sort(key=lambda x: x['date'])
            
            # Limitar a 5 próximas escalas
            upcoming_scales = user_scales[:5]
            
            return jsonify({
                'success': True,
                'data': {
                    'upcoming_scales': upcoming_scales,
                    'total_count': len(user_scales)
                }
            })
            
        except Exception as e:
            print(f"Erro no NotificationController.get_user_upcoming_scales: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

        
