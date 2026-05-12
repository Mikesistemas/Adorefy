from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required, get_jwt_identity
from flask_migrate import Migrate
from config import Config
from models import db, User, Ministry, MemberFunction
from datetime import datetime
import os
import requests

def create_app():
    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.config.from_object(Config)

    db.init_app(app)
    migrate = Migrate(app, db)
    jwt = JWTManager(app)
    CORS(app)

    from controllers.auth_controller import AuthController
    from controllers.user_controller import UserController
    from controllers.scale_controller import ScaleController
    from controllers.ministry_controller import MinistryController
    from controllers.song_controller import SongController
    from controllers.notification_controller import NotificationController
    from controllers.unavailability_controller import UnavailabilityController
    from controllers.reports_controller import ReportsController

    auth_controller = AuthController()
    user_controller = UserController()
    scale_controller = ScaleController()
    ministry_controller = MinistryController()
    song_controller = SongController()
    notification_controller = NotificationController()
    unavailability_controller = UnavailabilityController()
    reports_controller = ReportsController() 

    @app.route('/')
    def serve_frontend():
        return send_from_directory('templates', 'index.html')

    @app.route('/static/<path:path>')
    def serve_static(path):
        return send_from_directory('static', path)

    # Rotas de Autenticação
    @app.route('/login', methods=['POST'])
    def login():
        return auth_controller.login()

    @app.route('/register', methods=['POST'])
    def register():
        return auth_controller.register()

    @app.route('/user/current', methods=['GET'])
    @jwt_required()
    def get_current_user():
        return auth_controller.get_current_user()

    @app.route('/api/scales/monthly/update-group-detailed', methods=['PUT'])
    @jwt_required()
    def update_monthly_scale_group_detailed():
        return scale_controller.update_monthly_scale_group_with_details()    

    # Rotas de Escalas
    @app.route('/scales', methods=['GET', 'POST'])
    @jwt_required()
    def scales():
        if request.method == 'GET':
            return scale_controller.get_all()
        return scale_controller.create()

    @app.route('/songs/<int:song_id>', methods=['GET'])
    @jwt_required()
    def get_song_by_id(song_id):
        return song_controller.get_by_id(song_id)

    @app.route('/songs/search', methods=['GET'])
    @jwt_required()
    def search_songs():
        return song_controller.search()

    # No seu app.py, adicione esta rota junto com as outras rotas de songs:

    @app.route('/songs/fetch-lyrics-chords', methods=['POST'])
    @jwt_required()
    def fetch_song_lyrics_chords():
        return song_controller.fetch_lyrics_chords()    

    @app.route('/scales', methods=['PUT'])
    @jwt_required()
    def update_scale():
        return scale_controller.update()

    # Rotas de Membros
    @app.route('/members', methods=['GET', 'POST'])
    @jwt_required()
    def members():
        if request.method == 'GET':
            return user_controller.get_all()
        return user_controller.create()

    @app.route('/members', methods=['PUT'])
    @jwt_required()
    def update_member():
        return user_controller.update()

    # NOVA ROTA: Gerenciamento de Membros (apenas para líderes)
    @app.route('/members/management')
    @jwt_required()
    def get_management_members():
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user:
            return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
        # Verificar se é líder ou admin
        '''if current_user.role not in ['admin', 'lider']:
            return jsonify({'success': False, 'error': 'Acesso negado. Apenas líderes podem acessar.'}), 403'''
        
        # Chamar o método do controller
        return user_controller.get_management_members()

    @app.route('/songs', methods=['DELETE'])
    @jwt_required()
    def delete_song():
        return song_controller.delete()   


    @app.route('/api/scales/monthly/batch', methods=['POST'])
    @jwt_required()
    def create_monthly_scale_batch():
        return scale_controller.create_monthly_scale_batch()

    @app.route('/api/scales/monthly/groups', methods=['GET'])
    @jwt_required()
    def get_monthly_scale_groups():
        return scale_controller.get_monthly_scale_groups()

    @app.route('/api/scales/monthly/groups/<string:scale_group>', methods=['GET'])
    @jwt_required()
    def get_monthly_scale_group_details(scale_group):
        return scale_controller.get_monthly_scale_group_details(scale_group)
    
    @app.route('/api/scales/monthly/groups/<string:scale_group>/edit', methods=['GET'])
    @jwt_required()
    def get_monthly_scale_group_for_edit(scale_group):  # CORREÇÃO: Adicionar parâmetro
        return scale_controller.get_monthly_scale_group_for_edit(scale_group) 

    @app.route('/api/scales/monthly/update-group', methods=['PUT'])
    @jwt_required()
    def update_monthly_scale_group():
        return scale_controller.update_monthly_scale_group()


    @app.route('/api/scales/monthly/update-group/v2', methods=['PUT'])
    @jwt_required()
    def update_monthly_scale_group_v2():
        return scale_controller.update_monthly_scale_group_v2()


    @app.route('/api/scales/check-date', methods=['POST'])
    @jwt_required()
    def check_date_availability():
        return scale_controller.check_date_availability()

    @app.route('/api/scales/month-calendar', methods=['POST'])
    @jwt_required()
    def get_month_calendar():
        return scale_controller.get_month_calendar()    


    @app.route('/api/notifications/upcoming-scales', methods=['GET'])
    @jwt_required()
    def get_user_upcoming_scales():
        return notification_controller.get_user_upcoming_scales()     
    
    # reports
    @app.route('/api/reports/dashboard', methods=['GET'])
    @jwt_required()
    def get_dashboard_report():
        return reports_controller.get_dashboard_indicators()  # Método CORRETO do controller

    @app.route('/api/reports/detailed', methods=['GET'])
    @jwt_required()
    def get_detailed_report():
        return reports_controller.get_detailed_report()  # Método CORRETO do controller

    @app.route('/api/reports/unavailability-history', methods=['GET'])
    @jwt_required()
    def get_unavailability_history():
        return reports_controller.get_unavailability_history()  # Método CORRETO do controller

    @app.route('/api/reports/top-songs', methods=['GET'])
    @jwt_required()
    def get_top_songs_report():
        return reports_controller.get_top_songs()  # Método CORRETO do controller

    @app.route('/api/reports/top-members', methods=['GET'])
    @jwt_required()
    def get_top_members_report():
        return reports_controller.get_top_members()  # Método CORRETO do controller
    
    
    @app.route('/api/ministries/<int:ministry_id>/member-functions', methods=['GET'])
    @jwt_required()
    def get_ministry_member_functions(ministry_id):
        current_user_id = get_jwt_identity()
        
        try:
            # Verificar ministério
            ministry = Ministry.query.get(ministry_id)
            if not ministry:
                return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
            
            # Verificar permissões
            current_user = User.query.get(current_user_id)
            if current_user.role not in ['admin', 'lider'] and not (ministry.leader_id == current_user_id):
                return jsonify({'success': False, 'error': 'Acesso negado'}), 403
            
            # Buscar funções do ministério
            functions = MemberFunction.query.filter_by(
                ministry_id=ministry_id, 
                is_active=True
            ).order_by(MemberFunction.order, MemberFunction.name).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'functions': [func.to_dict() for func in functions],
                    'ministry': {
                        'id': ministry.id,
                        'name': ministry.name,
                        'leader_id': ministry.leader_id
                    }
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions', methods=['GET'])
    @jwt_required()
    def get_member_functions():
        current_user_id = get_jwt_identity()
        
        try:
            # Buscar usuário atual
            current_user = User.query.get(current_user_id)
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Filtrar por ministério se fornecido
            ministry_id = request.args.get('ministry_id', type=int)
            
            query = MemberFunction.query.filter_by(is_active=True)
            
            if ministry_id:
                # Verificar se usuário tem acesso ao ministério
                ministry = Ministry.query.get(ministry_id)
                if not ministry:
                    return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
                
                # Verificar permissões
                if current_user.role not in ['admin', 'lider'] and not (ministry.leader_id == current_user_id):
                    return jsonify({'success': False, 'error': 'Acesso negado'}), 403
                
                query = query.filter_by(ministry_id=ministry_id)
            else:
                # Para admin/lider: mostrar todas as funções
                # Para outros: mostrar apenas funções dos seus ministérios
                if current_user.role not in ['admin', 'lider']:
                    user_ministries = current_user.get_ministries()
                    query = query.filter(MemberFunction.ministry_id.in_(user_ministries))
            
            functions = query.order_by(MemberFunction.order, MemberFunction.name).all()
            
            return jsonify({
                'success': True,
                'data': {
                    'functions': [func.to_dict() for func in functions]
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions/<int:function_id>', methods=['GET'])
    @jwt_required()
    def get_member_function(function_id):
        current_user_id = get_jwt_identity()
        
        try:
            function = MemberFunction.query.get(function_id)
            if not function:
                return jsonify({'success': False, 'error': 'Função não encontrada'}), 404
            
            # Verificar permissões
            current_user = User.query.get(current_user_id)
            if current_user.role not in ['admin', 'lider'] and not (function.leader_id == current_user_id):
                return jsonify({'success': False, 'error': 'Acesso negado'}), 403
            
            return jsonify({
                'success': True,
                'data': {
                    'function': function.to_dict()
                }
            })
            
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions', methods=['POST'])
    @jwt_required()
    def create_member_function():
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        try:
            # Validações
            if not data or 'name' not in data or 'ministry_id' not in data:
                return jsonify({'success': False, 'error': 'Nome e ministério são obrigatórios'}), 400
            
            # Verificar ministério
            ministry = Ministry.query.get(data['ministry_id'])
            if not ministry:
                return jsonify({'success': False, 'error': 'Ministério não encontrado'}), 404
            
            # Verificar permissões
            current_user = User.query.get(current_user_id)
            if current_user.role not in ['admin', 'lider'] and not (ministry.leader_id == current_user_id):
                return jsonify({'success': False, 'error': 'Acesso negado'}), 403
            
            # Verificar se função já existe no ministério
            existing = MemberFunction.query.filter_by(
                ministry_id=data['ministry_id'],
                name=data['name'].strip(),
                is_active=True
            ).first()
            
            if existing:
                return jsonify({'success': False, 'error': 'Função já existe neste ministério'}), 400
            
            # Criar nova função
            new_function = MemberFunction(
                name=data['name'].strip(),
                description=data.get('description', ''),
                ministry_id=data['ministry_id'],
                leader_id=current_user_id,
                color=data.get('color', '#9147ff'),
                order=data.get('order', 0)
            )
            
            db.session.add(new_function)
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Função criada com sucesso',
                'data': {
                    'function': new_function.to_dict()
                }
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions/<int:function_id>', methods=['PUT'])
    @jwt_required()
    def update_member_function(function_id):
        current_user_id = get_jwt_identity()
        data = request.get_json()
        
        try:
            function = MemberFunction.query.get(function_id)
            if not function:
                return jsonify({'success': False, 'error': 'Função não encontrada'}), 404
            
            # Verificar permissões
            current_user = User.query.get(current_user_id)
            if current_user.role not in ['admin', 'lider'] and not (function.leader_id == current_user_id):
                return jsonify({'success': False, 'error': 'Acesso negado'}), 403
            
            # Atualizar campos
            if 'name' in data and data['name']:
                # Verificar se nome já existe no mesmo ministério
                existing = MemberFunction.query.filter(
                    MemberFunction.ministry_id == function.ministry_id,
                    MemberFunction.name == data['name'].strip(),
                    MemberFunction.id != function_id,
                    MemberFunction.is_active == True
                ).first()
                
                if existing:
                    return jsonify({'success': False, 'error': 'Função com este nome já existe'}), 400
                
                function.name = data['name'].strip()
            
            if 'description' in data:
                function.description = data['description']
            
            if 'color' in data:
                function.color = data['color']
            
            if 'order' in data:
                function.order = data['order']
            
            if 'is_active' in data:
                function.is_active = data['is_active']
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Função atualizada com sucesso',
                'data': {
                    'function': function.to_dict()
                }
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions/<int:function_id>', methods=['DELETE'])
    @jwt_required()
    def delete_member_function(function_id):
        current_user_id = get_jwt_identity()
        
        try:
            function = MemberFunction.query.get(function_id)
            if not function:
                return jsonify({'success': False, 'error': 'Função não encontrada'}), 404
            
            # Verificar permissões
            current_user = User.query.get(current_user_id)
            if current_user.role not in ['admin', 'lider'] and not (function.leader_id == current_user_id):
                return jsonify({'success': False, 'error': 'Acesso negado'}), 403
            
            # Soft delete (marcar como inativa)
            function.is_active = False
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': 'Função removida com sucesso'
            })
            
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'error': str(e)}), 500
    
    @app.route('/api/member-functions/defaults', methods=['GET'])
    @jwt_required()
    def get_default_functions():
        """Retorna funções padrão para facilitar a criação"""
        
        default_functions = [
            {'name': 'Vocal Principal', 'color': '#FF6B6B', 'description': 'Vocal principal do louvor'},
            {'name': 'Backing Vocal', 'color': '#FF8E6B', 'description': 'Vocal de apoio/harmonia'},
            {'name': 'Violão/Guitarra', 'color': '#4ECDC4', 'description': 'Violão ou guitarra elétrica'},
            {'name': 'Baixo', 'color': '#1A535C', 'description': 'Baixo elétrico'},
            {'name': 'Bateria', 'color': '#FFD166', 'description': 'Bateria e percussão'},
            {'name': 'Teclado/Piano', 'color': '#06D6A0', 'description': 'Teclado ou piano'},
            {'name': 'Violino', 'color': '#118AB2', 'description': 'Violino'},
            {'name': 'Flauta', 'color': '#073B4C', 'description': 'Flauta ou instrumento de sopro'},
            {'name': 'Diretor Musical', 'color': '#7209B7', 'description': 'Diretor/regente musical'},
            {'name': 'Solista', 'color': '#F72585', 'description': 'Solista convidado'},
            {'name': 'Auxiliar', 'color': '#4361EE', 'description': 'Auxiliar geral do louvor'},
            {'name': 'Técnico de Som', 'color': '#4CC9F0', 'description': 'Operador de som'},
            {'name': 'Projeção', 'color': '#3A0CA3', 'description': 'Projeção de letras e vídeos'},
        ]
        
        return jsonify({
            'success': True,
            'data': {
                'default_functions': default_functions
            }
        })     

    @app.route('/api/permissions/available', methods=['GET'])
    @jwt_required()
    def get_available_permissions():
        """Retorna lista de todas as permissões disponíveis no sistema"""
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Permissões básicas (para todos)
            basic_permissions = {
                'escala_view': 'Ver Escalas',
                'escala_create': 'Criar Escalas',
                'escala_view_all': 'Ver Todas as Escalas',
                'escala_edit_all': 'Editar Todas as Escalas'
            }
            
            # Permissões de gerenciamento
            management_permissions = {
                'membros_gerenciar': 'Gerenciar Membros',
                'ministerios_gerenciar': 'Gerenciar Ministérios',
                'musicas_gerenciar': 'Gerenciar Músicas',
                'unavailability_approve': 'Aprovar Indisponibilidades',
                'month_scales': 'Criar escalas mensais'
            }
            
            # Permissão total (apenas admin)
            admin_permissions = {
                'membros_gerenciar_all': 'Gerenciar Todos Membros',
                'all': 'Todas as Permissões (Admin)'
            }
            
            all_permissions = {**basic_permissions, **management_permissions}
            
            # Se for admin, incluir permissões de admin
            if current_user.role == 'admin' or 'all' in current_user.get_permissions():
                all_permissions = {**all_permissions, **admin_permissions}
            
            return jsonify({
                'success': True,
                'data': {
                    'permissions': all_permissions,
                    'user_role': current_user.role
                }
            })
            
        except Exception as e:
            print(f"❌ Erro ao buscar permissões disponíveis: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/members/<int:user_id>', methods=['GET'])
    @jwt_required()
    def get_member_by_id(user_id):
        return user_controller.get_user_by_id(user_id)

    # Rotas de Permissões de Usuários
    @app.route('/api/users/permissions', methods=['PUT'])
    @jwt_required()
    def update_user_permissions():
        return user_controller.update_user_permissions()

    # Rota para buscar permissões de um usuário específico (opcional, mas útil)
    @app.route('/api/users/<int:user_id>/permissions', methods=['GET'])
    @jwt_required()
    def get_user_permissions(user_id):
        try:
            current_user_id = get_jwt_identity()
            current_user = User.query.get(current_user_id)
            
            if not current_user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Verificar permissões
            user_permissions = current_user.get_permissions()
            can_manage_all = (
                'membros_gerenciar_all' in user_permissions or
                'all' in user_permissions
            )
            
            if not can_manage_all and current_user.role not in ['admin', 'lider']:
                return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            user = User.query.get(user_id)
            if not user:
                return jsonify({'success': False, 'error': 'Usuário não encontrado'}), 404
            
            # Se for líder, verificar se o usuário está nos seus ministérios
            if current_user.role == 'lider' and not can_manage_all:
                user_ministries = set(user.get_ministries() or [])
                leader_ministries = set([m.id for m in current_user.led_ministries])
                
                if not user_ministries.intersection(leader_ministries):
                    return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
            return jsonify({
                'success': True,
                'data': {
                    'permissions': user.get_permissions(),
                    'user': {
                        'id': user.id,
                        'name': user.name,
                        'role': user.role
                    }
                }
            })
            
        except Exception as e:
            print(f"❌ Erro ao buscar permissões: {str(e)}")
            return jsonify({'success': False, 'error': str(e)}), 500

    # Rotas de Ministérios
    @app.route('/ministries', methods=['GET', 'POST'])
    @jwt_required()
    def ministries():
        if request.method == 'GET':
            return ministry_controller.get_all()
        return ministry_controller.create()

    @app.route('/ministries', methods=['PUT'])
    @jwt_required()
    def update_ministry():
        return ministry_controller.update()

    # Rotas de Músicas
    @app.route('/songs', methods=['GET', 'POST'])
    @jwt_required()
    def songs():
        if request.method == 'GET':
            return song_controller.get_all()
        return song_controller.create()

    @app.route('/songs', methods=['PUT'])
    @jwt_required()
    def update_song():
        return song_controller.update()
        
    @app.route('/youtube/search', methods=['GET', 'POST'])
    @jwt_required()
    def youtube_search():
      print("🎵🎵🎵 ROTA /youtube/search ACESSADA! 🎵🎵🎵")
      try:
        data = request.get_json()
        query = data.get('query', '').strip()
        max_results = min(data.get('maxResults', 10), 15)

        if not query:
            return jsonify({
                'success': False,
                'error': 'Query de pesquisa é obrigatória'
            }), 400

        youtube_api_key = os.getenv('YOUTUBE_API_KEY')
        if not youtube_api_key:
            return jsonify({
                'success': False,
                'error': 'YOUTUBE_API_KEY não configurada no .env'
            }), 500

        # Primeira chamada: buscar vídeos
        search_url = 'https://www.googleapis.com/youtube/v3/search'
        search_params = {
            'part': 'snippet',
            'type': 'video',
            'maxResults': max_results,
            'q': query,
            'key': youtube_api_key,
            'relevanceLanguage': 'pt',
            'regionCode': 'BR',
            'videoCategoryId': '10'
        }

        search_response = requests.get(search_url, params=search_params, timeout=10)
        
        if search_response.status_code != 200:
            error_data = search_response.json()
            return jsonify({
                'success': False,
                'error': f'Erro na pesquisa: {error_data.get("error", {}).get("message", "Erro desconhecido")}'
            }), search_response.status_code

        search_data = search_response.json()

        # Extrair IDs dos vídeos para buscar durações
        video_ids = [item['id']['videoId'] for item in search_data.get('items', [])]
        
        videos = []
        
        if video_ids:
            # Segunda chamada: buscar detalhes dos vídeos (incluindo duração)
            videos_url = 'https://www.googleapis.com/youtube/v3/videos'
            videos_params = {
                'part': 'contentDetails,snippet',
                'id': ','.join(video_ids),
                'key': youtube_api_key
            }

            videos_response = requests.get(videos_url, params=videos_params, timeout=10)
            
            if videos_response.status_code == 200:
                videos_data = videos_response.json()
                
                # Mapear durações por ID
                duration_map = {}
                for item in videos_data.get('items', []):
                    duration_map[item['id']] = item['contentDetails']['duration']
                
                # Combinar dados
                for item in search_data.get('items', []):
                    video_id = item['id']['videoId']
                    video_info = {
                        'id': video_id,
                        'title': item['snippet']['title'],
                        'channelTitle': item['snippet']['channelTitle'],
                        'thumbnail': item['snippet']['thumbnails']['medium']['url'],
                        'publishedAt': item['snippet']['publishedAt'],
                        'duration': duration_map.get(video_id, ''),
                        'description': item['snippet']['description'][:100] + '...' if len(item['snippet']['description']) > 100 else item['snippet']['description']
                    }
                    videos.append(video_info)
            else:
                # Fallback: usar apenas dados da pesquisa
                for item in search_data.get('items', []):
                    video_info = {
                        'id': item['id']['videoId'],
                        'title': item['snippet']['title'],
                        'channelTitle': item['snippet']['channelTitle'],
                        'thumbnail': item['snippet']['thumbnails']['medium']['url'],
                        'publishedAt': item['snippet']['publishedAt'],
                        'duration': '',
                        'description': item['snippet']['description'][:100] + '...' if len(item['snippet']['description']) > 100 else item['snippet']['description']
                    }
                    videos.append(video_info)
        else:
            videos = []

        return jsonify({
            'success': True,
            'data': {
                'videos': videos,
                'totalResults': search_data.get('pageInfo', {}).get('totalResults', 0)
            }
        })

      except Exception as e:
        print(f'Erro na pesquisa do YouTube: {str(e)}')
        return jsonify({
            'success': False,
            'error': 'Erro interno do servidor'
        }), 500    

    # Rotas de Notificações
    @app.route('/notifications', methods=['GET'])
    @jwt_required()
    def notifications():
        return notification_controller.get_user_notifications()

    @app.route('/notifications/read', methods=['PUT'])
    @jwt_required()
    def mark_notification_read():
        return notification_controller.mark_as_read()

    @app.route('/notifications/read-all', methods=['PUT'])
    @jwt_required()
    def mark_all_notifications_read():
        return notification_controller.mark_all_as_read()

    @app.route('/notifications/clear', methods=['DELETE'])
    @jwt_required()
    def clear_notifications():
        return notification_controller.clear_all()

    # Rotas de Indisponibilidade
    @app.route('/members/unavailability', methods=['POST'])
    @jwt_required()
    def request_unavailability():
        return unavailability_controller.request_unavailability()

    @app.route('/unavailability/pending', methods=['GET'])
    @jwt_required()
    def get_pending_requests():
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user or current_user.role not in ['admin', 'lider']:
            return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
        return unavailability_controller.get_pending_requests()

    @app.route('/unavailability/process', methods=['PUT'])
    @jwt_required()
    def process_unavailability_request():
        current_user_id = get_jwt_identity()
        current_user = User.query.get(current_user_id)
        
        if not current_user or current_user.role not in ['admin', 'lider']:
            return jsonify({'success': False, 'error': 'Permissão negada'}), 403
            
        return unavailability_controller.process_request()

    @app.route('/user/unavailability', methods=['GET'])
    @jwt_required()
    def get_user_unavailability():
        return unavailability_controller.get_user_unavailability()

    # Rota de Debug
    @app.route('/debug', methods=['GET'])
    def debug():
        return jsonify({
            'status': 'API ChurchTime Flask Online',
            'database': 'SQLite' if 'sqlite' in app.config['SQLALCHEMY_DATABASE_URI'] else 'Other',
            'timestamp': datetime.utcnow().isoformat()
        })

    return app
    
    def format_duration(duration):
        """Converte duração ISO 8601 para formato legível"""
        import re
    
        if not duration:
          return ''
    
        # Converter PT1H2M3S para 1:02:03
        match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
        if not match:
         return duration
    
        hours = int(match.group(1) or 0)
        minutes = int(match.group(2) or 0)
        seconds = int(match.group(3) or 0)
    
        if hours > 0:
           return f"{hours}:{minutes:02d}:{seconds:02d}"
        else:
          return f"{minutes}:{seconds:02d}"
    
  
        
    
        

app = create_app()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
