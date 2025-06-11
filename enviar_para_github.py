import os
from dotenv import load_dotenv

load_dotenv()

token = os.getenv("GITHUB_TOKEN")

if not token:
    print("Token não encontrado!")
    exit()

print("Token carregado com segurança!")

# Aqui você pode fazer alguma ação, como enviar arquivos para o GitHub, usando o token
# Exemplo simples: mostrar o header de autenticação
headers = {
    "Authorization": f"token {token}",
    "Accept": "application/vnd.github.v3+json"
}

# Exemplo com a biblioteca requests:
import requests
response = requests.get("https://api.github.com/user", headers=headers)
print(response.json())
