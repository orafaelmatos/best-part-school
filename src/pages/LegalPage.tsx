import { Link, useLocation } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { APP_TARGET } from "@/apps/target";
import { APP_PATHS } from "@/lib/routes";
import { LEGAL_PATHS, ORGANIZATION_ID, ORGANIZATION_NAME, SUPPORT_EMAIL, supportMailto } from "@/lib/privacy";

export default function LegalPage() {
  const { pathname } = useLocation();
  const support = pathname === LEGAL_PATHS.support;
  const deletion = pathname === LEGAL_PATHS.deletion;
  const title = support ? "Suporte ao aplicativo" : deletion ? "Exclusão de conta e dados" : "Política de privacidade";
  return <main className="min-h-dvh bg-canvas px-gutter pb-[calc(3rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-ink">
    <article className="mx-auto max-w-3xl space-y-6 rounded-xl border border-line bg-surface p-5 sm:p-10">
      <Link to={APP_TARGET === "student" ? APP_PATHS.profile : "/"} className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-body font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"><ChevronLeft size={20} aria-hidden="true" />Voltar</Link>
      <div><p className="text-body font-semibold text-primary">{ORGANIZATION_NAME}</p><h1 className="mt-1 text-h2 text-ink">{title}</h1><p className="mt-1 text-body text-ink-secondary">Atualizado em 23 de novembro de 2026.</p></div>
      {support ? <div className="space-y-5 text-body-lg leading-7">
        <p>Precisa recuperar sua senha, corrigir um problema no aplicativo ou falar sobre seus dados? Entre em contato com a equipe da escola.</p>
        <p><a className="break-all font-semibold text-primary underline" href={supportMailto()}>{SUPPORT_EMAIL}</a></p>
        <p>Informe seu nome, o e-mail cadastrado, o modelo do aparelho e uma descrição do problema. Nunca envie sua senha. Se você perdeu o acesso ao e-mail cadastrado, informe isso para que a escola possa verificar sua identidade.</p>
        <p>Para denunciar uma resposta da inteligência artificial, use <strong>Denunciar resposta</strong> na própria conversa.</p>
      </div> : deletion ? <div className="space-y-5 text-body-lg leading-7">
        <p>Você pode excluir sua conta do aplicativo Best Part School em <strong>Perfil → Privacidade e IA → Excluir minha conta</strong>. Confirme sua senha e digite EXCLUIR. A operação remove sua conta e os dados vinculados na aplicação e encerra seu acesso.</p>
        <p>Se você não consegue entrar no aplicativo, solicite a exclusão pelo e-mail <a className="break-all font-semibold text-primary underline" href={supportMailto("Solicitação de exclusão de conta e dados")}>{SUPPORT_EMAIL}</a>. Informe o e-mail cadastrado e que deseja excluir a conta Best Part School. A escola verificará sua identidade antes de executar o pedido. Não envie sua senha.</p>
        <p>A exclusão abrange perfil, preferências, conversas de IA, gravações e registros individuais vinculados à conta. Materiais que pertencem à escola ou são compartilhados com a turma não são removidos de outras contas. Documentos cuja conservação seja obrigatória por lei poderão ser mantidos pela escola para essa finalidade.</p>
        <p>Excluir a conta do aplicativo não cancela automaticamente contratos, matrículas ou obrigações com a escola. Para esses assuntos, fale com o suporte.</p>
      </div> : <div className="space-y-6 text-body-lg leading-7">
        <section><h2 className="mb-1 text-h4 text-ink">Responsável e contato</h2><p>{ORGANIZATION_NAME}{ORGANIZATION_ID ? ` (${ORGANIZATION_ID})` : ""} é responsável pelo tratamento dos dados usados no aplicativo e no portal da escola. Contato para privacidade e suporte: <a className="break-all text-primary underline" href={supportMailto("Privacidade e dados pessoais")}>{SUPPORT_EMAIL}</a>.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Dados utilizados</h2><p>Tratamos nome, e-mail, credenciais de acesso protegidas, foto opcional, aulas, agenda, respostas a atividades, progresso e conversas de prática. O microfone é usado quando você escolhe gravar uma resposta; a foto é enviada quando você seleciona uma imagem. A plataforma web de gestão também pode tratar contratos, comprovantes e registros financeiros da relação com a escola.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Finalidades e acesso</h2><p>Os dados permitem autenticar sua conta, disponibilizar aulas, acompanhar seu aprendizado, atender pedidos de suporte e cumprir obrigações da relação educacional. Professores responsáveis e administradores acessam os registros necessários às suas funções. O aplicativo não inclui publicidade direcionada nem vende seus dados.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Inteligência artificial opcional</h2><p>Com sua autorização específica, enviamos à OpenAI textos, gravações de voz e conteúdos das aulas selecionadas para gerar transcrições, áudio, exercícios e feedback. Esses dados podem ser processados em infraestrutura fora do Brasil. O tratamento pelo fornecedor também segue seus termos e sua política de privacidade. Não compartilhe informações sensíveis desnecessárias nas práticas.</p><p className="mt-3">Você pode recusar e continuar usando aulas e materiais. Para interromper novos envios, revogue a autorização em Perfil → Privacidade e IA. A revogação não desfaz processamentos anteriores. Respostas da IA podem conter erros; use o recurso de denúncia para comunicar problemas à escola.</p><a href="https://openai.com/policies/privacy-policy/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Política de privacidade da OpenAI</a></section>
        <section><h2 className="mb-1 text-h4 text-ink">Armazenamento e segurança</h2><p>Os dados ficam nos serviços de hospedagem utilizados pela escola. O acesso à aplicação usa autenticação; credenciais locais do aplicativo usam o armazenamento seguro do dispositivo. Links de arquivos privados possuem validade limitada. Informações de operação e segurança podem ser usadas para diagnosticar falhas e proteger o serviço.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Conservação e exclusão</h2><p>Dados de acesso e aprendizado são conservados enquanto necessários ao atendimento da conta e da relação educacional. A exclusão da conta remove os registros vinculados na base ativa e arquivos que não sejam compartilhados com outras contas. Registros sujeitos a obrigação legal e cópias de segurança seguem as rotinas de conservação da escola e de seus fornecedores.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Seus direitos</h2><p>Você pode solicitar acesso, correção, esclarecimentos sobre compartilhamento e exclusão de dados pelo contato acima. A escola poderá verificar sua identidade para proteger sua conta. A autorização de IA pode ser revogada no aplicativo. Para exclusão, consulte as instruções abaixo.</p></section>
        <section><h2 className="mb-1 text-h4 text-ink">Alunos menores de idade</h2><p>O uso por menores de idade deve ocorrer com a participação do responsável legal e conforme a matrícula na escola. O responsável pode contatar a escola para tratar de acesso, uso de IA e direitos sobre dados do aluno.</p></section>
      </div>}
      <nav aria-label="Informações do aplicativo" className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-body font-semibold text-primary">{Object.entries({ [LEGAL_PATHS.privacy]: "Privacidade", [LEGAL_PATHS.support]: "Suporte", [LEGAL_PATHS.deletion]: "Excluir conta" }).map(([path, label]) => <Link key={path} to={path} className="inline-flex min-h-11 items-center underline">{label}</Link>)}</nav>
    </article>
  </main>;
}
