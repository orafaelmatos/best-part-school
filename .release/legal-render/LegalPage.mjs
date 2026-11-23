import { Link, useLocation } from "react-router-dom";
import { jsx, jsxs } from "react/jsx-runtime";
// src/apps/target.ts
var configuredTarget = "site";
if (![
	"legacy",
	"site",
	"admin",
	"student"
].includes(configuredTarget)) throw new Error(`Invalid VITE_APP_TARGET: ${configuredTarget}`);
// src/lib/routes.ts
var APP_BASE_PATH = "/app";
var withAppBase = (path = "") => {
	if (!path || path === "/") return APP_BASE_PATH;
	return `${APP_BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
};
withAppBase(), withAppBase("/estudar"), withAppBase("/perfil"), withAppBase("/alunos"), withAppBase("/alunos/novo"), withAppBase("/aulas"), withAppBase("/aulas/nova"), withAppBase("/homework"), withAppBase("/palavras-aprendidas"), withAppBase("/jogo-de-vocabulario"), withAppBase("/corrigir-homework"), withAppBase("/crm"), withAppBase("/calendario"), withAppBase("/marketplace"), withAppBase("/cursos/novo"), withAppBase("/treinar-ia"), withAppBase("/interprete-ia"), withAppBase("/financeiro"), withAppBase("/pagamentos");
// src/lib/privacy.ts
var ORGANIZATION_NAME = "Best Part School";
var SUPPORT_EMAIL = "gabriel@bestpartschol.com";
var LEGAL_PATHS = {
	privacy: "/privacidade",
	support: "/suporte",
	deletion: "/excluir-conta"
};
var supportMailto = (subject = "Suporte ao aplicativo Best Part School") => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
// src/pages/LegalPage.tsx
function LegalPage() {
	const { pathname } = useLocation();
	const support = pathname === LEGAL_PATHS.support;
	const deletion = pathname === LEGAL_PATHS.deletion;
	return /* @__PURE__ */ jsx("main", {
		className: "min-h-[100dvh] bg-[#f6f7fb] px-5 pb-[calc(3rem_+_env(safe-area-inset-bottom))] pt-[calc(2rem_+_env(safe-area-inset-top))] text-slate-800",
		children: /* @__PURE__ */ jsxs("article", {
			className: "mx-auto max-w-3xl space-y-6 rounded-2xl border bg-white p-6 shadow-sm sm:p-10",
			children: [
				/* @__PURE__ */ jsx(Link, {
					to: "/",
					className: "inline-flex min-h-11 items-center font-semibold text-primary",
					children: "← Voltar"
				}),
				/* @__PURE__ */ jsxs("div", { children: [
					/* @__PURE__ */ jsx("p", {
						className: "text-sm font-semibold text-primary",
						children: ORGANIZATION_NAME
					}),
					/* @__PURE__ */ jsx("h1", {
						className: "mt-2 text-3xl font-bold",
						children: support ? "Suporte ao aplicativo" : deletion ? "Exclusão de conta e dados" : "Política de privacidade"
					}),
					/* @__PURE__ */ jsx("p", {
						className: "mt-2 text-sm text-slate-500",
						children: "Atualizado em 23 de novembro de 2026."
					})
				] }),
				support ? /* @__PURE__ */ jsxs("div", {
					className: "space-y-5 leading-7",
					children: [
						/* @__PURE__ */ jsx("p", { children: "Precisa recuperar sua senha, corrigir um problema no aplicativo ou falar sobre seus dados? Entre em contato com a equipe da escola." }),
						/* @__PURE__ */ jsx("p", { children: /* @__PURE__ */ jsx("a", {
							className: "break-all font-semibold text-primary underline",
							href: supportMailto(),
							children: SUPPORT_EMAIL
						}) }),
						/* @__PURE__ */ jsx("p", { children: "Informe seu nome, o e-mail cadastrado, o modelo do aparelho e uma descrição do problema. Nunca envie sua senha. Se você perdeu o acesso ao e-mail cadastrado, informe isso para que a escola possa verificar sua identidade." }),
						/* @__PURE__ */ jsxs("p", { children: [
							"Para denunciar uma resposta da inteligência artificial, use ",
							/* @__PURE__ */ jsx("strong", { children: "Denunciar resposta" }),
							" na própria conversa."
						] })
					]
				}) : deletion ? /* @__PURE__ */ jsxs("div", {
					className: "space-y-5 leading-7",
					children: [
						/* @__PURE__ */ jsxs("p", { children: [
							"Você pode excluir sua conta do aplicativo Best Part School em ",
							/* @__PURE__ */ jsx("strong", { children: "Perfil → Privacidade e IA → Excluir minha conta" }),
							". Confirme sua senha e digite EXCLUIR. A operação remove sua conta e os dados vinculados na aplicação e encerra seu acesso."
						] }),
						/* @__PURE__ */ jsxs("p", { children: [
							"Se você não consegue entrar no aplicativo, solicite a exclusão pelo e-mail ",
							/* @__PURE__ */ jsx("a", {
								className: "break-all font-semibold text-primary underline",
								href: supportMailto("Solicitação de exclusão de conta e dados"),
								children: SUPPORT_EMAIL
							}),
							". Informe o e-mail cadastrado e que deseja excluir a conta Best Part School. A escola verificará sua identidade antes de executar o pedido. Não envie sua senha."
						] }),
						/* @__PURE__ */ jsx("p", { children: "A exclusão abrange perfil, preferências, conversas de IA, gravações e registros individuais vinculados à conta. Materiais que pertencem à escola ou são compartilhados com a turma não são removidos de outras contas. Documentos cuja conservação seja obrigatória por lei poderão ser mantidos pela escola para essa finalidade." }),
						/* @__PURE__ */ jsx("p", { children: "Excluir a conta do aplicativo não cancela automaticamente contratos, matrículas ou obrigações com a escola. Para esses assuntos, fale com o suporte." })
					]
				}) : /* @__PURE__ */ jsxs("div", {
					className: "space-y-6 leading-7",
					children: [
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Responsável e contato"
						}), /* @__PURE__ */ jsxs("p", { children: [
							ORGANIZATION_NAME,
							"",
							" é responsável pelo tratamento dos dados usados no aplicativo e no portal da escola. Contato para privacidade e suporte: ",
							/* @__PURE__ */ jsx("a", {
								className: "break-all text-primary underline",
								href: supportMailto("Privacidade e dados pessoais"),
								children: SUPPORT_EMAIL
							}),
							"."
						] })] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Dados utilizados"
						}), /* @__PURE__ */ jsx("p", { children: "Tratamos nome, e-mail, credenciais de acesso protegidas, foto opcional, aulas, agenda, respostas a atividades, progresso e conversas de prática. O microfone é usado quando você escolhe gravar uma resposta; a foto é enviada quando você seleciona uma imagem. A plataforma web de gestão também pode tratar contratos, comprovantes e registros financeiros da relação com a escola." })] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Finalidades e acesso"
						}), /* @__PURE__ */ jsx("p", { children: "Os dados permitem autenticar sua conta, disponibilizar aulas, acompanhar seu aprendizado, atender pedidos de suporte e cumprir obrigações da relação educacional. Professores responsáveis e administradores acessam os registros necessários às suas funções. O aplicativo não inclui publicidade direcionada nem vende seus dados." })] }),
						/* @__PURE__ */ jsxs("section", { children: [
							/* @__PURE__ */ jsx("h2", {
								className: "text-lg font-bold",
								children: "Inteligência artificial opcional"
							}),
							/* @__PURE__ */ jsx("p", { children: "Com sua autorização específica, enviamos à OpenAI textos, gravações de voz e conteúdos das aulas selecionadas para gerar transcrições, áudio, exercícios e feedback. Esses dados podem ser processados em infraestrutura fora do Brasil. O tratamento pelo fornecedor também segue seus termos e sua política de privacidade. Não compartilhe informações sensíveis desnecessárias nas práticas." }),
							/* @__PURE__ */ jsx("p", {
								className: "mt-3",
								children: "Você pode recusar e continuar usando aulas e materiais. Para interromper novos envios, revogue a autorização em Perfil → Privacidade e IA. A revogação não desfaz processamentos anteriores. Respostas da IA podem conter erros; use o recurso de denúncia para comunicar problemas à escola."
							}),
							/* @__PURE__ */ jsx("a", {
								href: "https://openai.com/policies/privacy-policy/",
								target: "_blank",
								rel: "noreferrer",
								className: "inline-flex min-h-11 items-center text-primary underline",
								children: "Política de privacidade da OpenAI"
							})
						] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Armazenamento e segurança"
						}), /* @__PURE__ */ jsx("p", { children: "Os dados ficam nos serviços de hospedagem utilizados pela escola. O acesso à aplicação usa autenticação; credenciais locais do aplicativo usam o armazenamento seguro do dispositivo. Links de arquivos privados possuem validade limitada. Informações de operação e segurança podem ser usadas para diagnosticar falhas e proteger o serviço." })] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Conservação e exclusão"
						}), /* @__PURE__ */ jsx("p", { children: "Dados de acesso e aprendizado são conservados enquanto necessários ao atendimento da conta e da relação educacional. A exclusão da conta remove os registros vinculados na base ativa e arquivos que não sejam compartilhados com outras contas. Registros sujeitos a obrigação legal e cópias de segurança seguem as rotinas de conservação da escola e de seus fornecedores." })] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Seus direitos"
						}), /* @__PURE__ */ jsx("p", { children: "Você pode solicitar acesso, correção, esclarecimentos sobre compartilhamento e exclusão de dados pelo contato acima. A escola poderá verificar sua identidade para proteger sua conta. A autorização de IA pode ser revogada no aplicativo. Para exclusão, consulte as instruções abaixo." })] }),
						/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", {
							className: "text-lg font-bold",
							children: "Alunos menores de idade"
						}), /* @__PURE__ */ jsx("p", { children: "O uso por menores de idade deve ocorrer com a participação do responsável legal e conforme a matrícula na escola. O responsável pode contatar a escola para tratar de acesso, uso de IA e direitos sobre dados do aluno." })] })
					]
				}),
				/* @__PURE__ */ jsx("nav", {
					"aria-label": "Informações do aplicativo",
					className: "flex flex-wrap gap-x-5 gap-y-2 border-t pt-5 text-sm font-semibold text-primary",
					children: Object.entries({
						[LEGAL_PATHS.privacy]: "Privacidade",
						[LEGAL_PATHS.support]: "Suporte",
						[LEGAL_PATHS.deletion]: "Excluir conta"
					}).map(([path, label]) => /* @__PURE__ */ jsx(Link, {
						to: path,
						className: "inline-flex min-h-11 items-center underline",
						children: label
					}, path))
				})
			]
		})
	});
}
export { LegalPage as default };
