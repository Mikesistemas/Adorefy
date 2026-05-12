from flask import request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Ministry, User
from datetime import datetime

class MinistryController:
    
    @jwt_required()
    def get_all(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)

            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404

            user_permissions = current_user.get_permissions()
            can_manage_all = 'ministerios_gerenciar_all' in user_permissions or 'all' in user_permissions

            if can_manage_all:
                ministries = Ministry.query.all()
            else:
                ministries = []
                user_ministries = current_user.get_ministries() or []
                for ministry_id in user_ministries:
                    ministry = Ministry.query.get(ministry_id)
                    if ministry:
                        ministries.append(ministry)

            ministries_data = [m.to_dict() for m in ministries]

            return jsonify({'success': True, 'data': {'ministries': ministries_data}})

        except Exception as e:
            print(f"Erro no MinistryController.get_all: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

    # ======================
    # CREATE MINISTRY
    # ======================
    @jwt_required()
    def create(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
    
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
    
            if current_user.role not in ['admin', 'lider']:
                return jsonify({'success': False, 'error': 'Apenas líderes ou administradores podem criar ministérios'}), 403
    
            user_permissions = current_user.get_permissions()
            can_manage = (
                'ministerios_gerenciar' in user_permissions or
                'ministerios_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )
    
            if not can_manage:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
    
            data = request.get_json()
    
            if not data.get('name'):
                return jsonify({'success': False, 'error': 'Nome do ministério é obrigatório'}), 400
    
            ministry = Ministry(
                name=data['name'],
                description=data.get('description', ''),
                leader_id=data.get('leader')
            )
    
            db.session.add(ministry)
            db.session.flush()  # Para obter o ID do ministério
    
            # CORREÇÃO: Garantir que o líder esteja nos membros
            members = data.get('members', [])
            
            # Se houver um líder definido, adicioná-lo automaticamente aos membros
            if ministry.leader_id and ministry.leader_id not in members:
                members.append(ministry.leader_id)
                print(f"✅ Líder {ministry.leader_id} adicionado automaticamente aos membros do ministério {ministry.id}")
            
            ministry.set_members(members)
            
            db.session.commit()
    
            return jsonify({
                'success': True,
                'message': 'Ministério criado com sucesso!',
                'data': {'ministry': ministry.to_dict()}
            })
    
        except Exception as e:
            db.session.rollback()
            print(f"Erro no MinistryController.create: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500
    
    # ======================
    # UPDATE MINISTRY
    # ======================
    @jwt_required()
    def update(self):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
    
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
    
            if current_user.role not in ['admin', 'lider']:
                return jsonify({'success': False, 'error': 'Apenas líderes ou administradores podem atualizar ministérios'}), 403
    
            user_permissions = current_user.get_permissions()
            can_manage = (
                'ministerios_gerenciar' in user_permissions or
                'ministerios_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )
    
            if not can_manage:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
    
            data = request.get_json()
            ministry_id = data.get('id')
    
            if not ministry_id:
                return jsonify({'success': False, 'error': 'ID do ministério é obrigatório'}), 400
    
            ministry = Ministry.query.get(ministry_id)
            if not ministry:
                return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
    
            # Atualiza campos simples
            if 'name' in data:
                ministry.name = data['name']
            if 'description' in data:
                ministry.description = data['description']
            if 'leader' in data:
                ministry.leader_id = data['leader']
    
            # CORREÇÃO: Garantir que o líder sempre esteja nos membros
            if 'members' in data:
                members = data['members']
                
                # Se houver líder, adicionar aos membros se não estiver
                if ministry.leader_id and ministry.leader_id not in members:
                    members.append(ministry.leader_id)
                    print(f"✅ Líder {ministry.leader_id} adicionado aos membros do ministério {ministry.id}")
                
                ministry.set_members(members)
            else:
                # Se não enviou membros, garantir que o líder atual esteja na lista
                if ministry.leader_id:
                    current_members = ministry.get_members() or []
                    if ministry.leader_id not in current_members:
                        current_members.append(ministry.leader_id)
                        ministry.set_members(current_members)
                        print(f"✅ Líder {ministry.leader_id} adicionado aos membros existentes do ministério {ministry.id}")
    
            db.session.commit()
    
            return jsonify({
                'success': True,
                'message': 'Ministério atualizado com sucesso!',
                'data': {'ministry': ministry.to_dict()}
            })
    
        except Exception as e:
            db.session.rollback()
            print(f"Erro no MinistryController.update: {e}")
            return jsonify({'success': False, 'error': str(e)}), 500

# Instância final
ministry_controller = MinistryController()

