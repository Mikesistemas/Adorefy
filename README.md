<img width="1538" height="1056" alt="image" src="https://github.com/user-attachments/assets/bc595a32-7513-4638-9360-3de711f142c1" /># Adorefy — Sistema de Escalas Ministeriais

Sistema para organização de escalas ministeriais, membros, ministérios, músicas, notificações e controle de indisponibilidade.

## Configuração segura

Antes de executar, copie o arquivo de exemplo e preencha suas credenciais localmente:

```bash
cp .env.example .env
```

Nunca publique o `.env` com dados reais no GitHub.

## Variáveis principais

```env
SECRET_KEY=
JWT_SECRET_KEY=
DATABASE_URL=
YOUTUBE_API_KEY=
SMTP_SERVER=
SMTP_PORT=
SMTP_USE_TLS=
EMAIL_SENDER=
EMAIL_PASSWORD=
EMAIL_TEST_RECIPIENT=
WHATSAPP_MASTER_KEY=
WHATSAPP_SERVER_URL=
APP_PUBLIC_URL=
```

## Instalação

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python run.py
```

## Observação importante

As credenciais reais de API, SMTP, WhatsApp e chaves secretas foram removidas do código e devem ser configuradas somente via `.env` no ambiente local ou no servidor.
