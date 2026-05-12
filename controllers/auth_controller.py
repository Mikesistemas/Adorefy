from flask import request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from models import db, User
from datetime import datetime

class AuthController:
    
    def login(self):
        try:
            data = request.get_json()
            email = data.get('email')
            password = data.get('password')
            
            if not email or not password:
                return jsonify({'success': False, 'error': 'Email e senha são obrigatórios'}), 400
            
            user = User.query.filter_by(email=email, is_active=True).first()
            
            if not user or not user.check_password(password):
                return jsonify({'success': False, 'error': 'Email ou senha incorretos'}), 401
            
            # Create access token
            access_token = create_access_token(identity=user.id)
            
            return jsonify({
                'success': True,
                'data': {
                    'user': user.to_dict(),
                    'token': access_token
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    def register(self):
        try:
            data = request.get_json()
            name = data.get('name')
            email = data.get('email')
            password = data.get('password')
            ministry = data.get('ministry')
            skills = data.get('skills', [])
            
            if not all([name, email, password, ministry]):
                return jsonify({'success': False, 'error': 'Todos os campos são obrigatórios'}), 400
            
            # Check if user already exists
            if User.query.filter_by(email=email).first():
                return jsonify({'success': False, 'error': 'Email já cadastrado'}), 400
            
            # Create new user
            user = User(
                name=name,
                email=email,
                role='membro',
                is_active=True
            )
            user.set_password(password)
            user.set_skills(skills)
            user.set_ministries([ministry])
            user.set_permissions(['escala_view'])
            
            db.session.add(user)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Cadastro realizado! Aguarde aprovação do líder.',
                'userId': user.id
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @jwt_required()
    def get_current_user(self):
        try:
            user_id = get_jwt_identity()
            user = User.query.get(user_id)
            
            if not user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            return jsonify({
                'success': True,
                'data': {
                    'user': user.to_dict()
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500