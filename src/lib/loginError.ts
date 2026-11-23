import axios from "axios";

export function describeLoginError(error: unknown, localApi: boolean): string {
  const unavailable = localApi
    ? "Não foi possível acessar a API local. Inicie npm run dev:api:mobile e mantenha o terminal aberto."
    : "Não foi possível acessar a API. Confira a conexão e o endereço configurado.";
  if (!axios.isAxiosError(error) || !error.response) return unavailable;
  const status = error.response.status;
  const detail = error.response.data?.detail;
  if (status === 400 || status === 401) return typeof detail === "string" ? detail : "E-mail ou senha incorretos. Use uma conta cadastrada neste ambiente.";
  if (status === 404) return "O endereço de login não foi encontrado. Confira a configuração da API e reinicie o app.";
  if (status >= 500) return localApi ? "A API local apresentou um erro. Consulte o terminal de npm run dev:api:mobile." : "A API está indisponível no momento. Tente novamente em instantes.";
  if (status === 403) return "A API recusou o acesso. Confira as permissões e a configuração deste ambiente.";
  return typeof detail === "string" ? detail : "Não foi possível entrar. Tente novamente.";
}
