# OpenObserve no EasyPanel

Configuração inicial para uma VPS Linux com 2 vCPUs, 8 GB de RAM e dois projetos
de baixo volume. O painel armazena os dados; o coletor lê logs e métricas da VPS;
os apps instrumentados enviam os traces. A instalação precisa ser validada na VPS:
este exemplo não foi executado no servidor de produção.

## 1. Criar o painel

No EasyPanel, crie o projeto `observabilidade` e um serviço **App** chamado
`openobserve`. Em **Fonte / Source**, selecione **Docker Image**:

```text
public.ecr.aws/zinclabs/openobserve:v1.1.0
```

O exemplo usa uma versão fixa com release publicada. Ao atualizar, confira as
notas da versão e a disponibilidade da tag OSS; evite mudar para uma versão RC
apenas por ela aparecer como a mais recente.

Em **Ambiente / Environment**, configure, substituindo email e senha:

```dotenv
ZO_ROOT_USER_EMAIL=seu-email@seu-dominio.com
ZO_ROOT_USER_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE_E_UNICA
ZO_LOCAL_MODE=true
ZO_LOCAL_MODE_STORAGE=disk
ZO_DATA_DIR=/data
ZO_HTTP_ADDR=0.0.0.0
ZO_HTTP_PORT=5080
ZO_COMPACT_DATA_RETENTION_DAYS=7
ZO_MEMORY_CACHE_ENABLED=false
ZO_MEM_TABLE_MAX_SIZE=256
ZO_MAX_FILE_SIZE_IN_MEMORY=64
```

Os dois últimos valores estão em MB e limitam buffers de ingestão, não o consumo
total. As credenciais root inicializam a primeira conta; alterar as variáveis
depois não deve ser tratado como um mecanismo de troca de senha dessa conta.

Em **Armazenamento / Storage**, adicione um **Volume** persistente:

| Campo | Valor |
| --- | --- |
| Nome | `openobserve-data` |
| Mount path | `/data` |

Em **Recursos / Resources**, use inicialmente limite de **2048 MB de memória** e
**1 CPU**, com **uma réplica**. Esses são limites propostos para avaliação; não
são uma garantia de capacidade. Confira a memória livre da VPS antes de implantar.

Em **Domínios / Domains**, use o domínio automático do EasyPanel ou um subdomínio
como `observabilidade.seu-dominio.com`, apontando para **HTTP, porta interna 5080**,
com HTTPS público. Se usar domínio próprio, configure o DNS para a VPS. Aplique as
configurações com **Implantar / Deploy** e entre com o email e a senha definidos.

O login do próprio OpenObserve protege o painel. Uma autenticação Basic extra no
proxy do EasyPanel interfere com o header de ingestão dos exemplos abaixo; este
guia usa a autenticação do OpenObserve.

## 2. Validar a ingestão

No seu computador ou na VPS, substitua domínio e email no comando. O curl pedirá
a senha no terminal:

```bash
curl --fail-with-body \
  --user 'seu-email@seu-dominio.com' \
  --header 'Content-Type: application/json' \
  --data '[{"message":"teste de observabilidade","service_name":"teste"}]' \
  'https://observabilidade.seu-dominio.com/api/default/infraestrutura/_json'
```

No painel, abra **Logs**, selecione o stream `infraestrutura`, intervalo dos
últimos 15 minutos, e procure `teste de observabilidade`. Verifique tanto o status
HTTP quanto a resposta de ingestão: ela deve indicar um registro aceito.

## 3. Conferir o formato dos logs Docker

No terminal **da VPS**, rode:

```bash
docker info --format '{{.DockerRootDir}} / {{.LoggingDriver}}'
docker ps --format '{{.ID}}  {{.Names}}'
```

Para um container dos seus projetos, confirme também a configuração individual:

```bash
docker inspect --format '{{.HostConfig.LogConfig.Type}} {{.LogPath}}' ID_DO_CONTAINER
```

O coletor deste guia pressupõe o driver **json-file**, com arquivos em
`/var/lib/docker/containers`. Se a raiz do Docker for outra, ajuste o bind mount
para ela, mantendo o destino usado pelo coletor. Drivers `local` e `journald`
precisam de outra configuração de leitura: não altere o daemon Docker nem
reinicie seus projetos apenas para encaixar neste exemplo.

## 4. Criar o coletor de logs e métricas

No projeto `observabilidade`, crie outro **App**, chamado `coletor`.
Em **Fonte**, use **Dockerfile inline**, com este conteúdo:

```dockerfile
FROM otel/opentelemetry-collector-contrib:0.165.0
USER 0
```

O usuário root permite ler os arquivos de logs do host. Os mounts de leitura do
host abaixo ficam em modo somente leitura. O coletor não precisa de domínio
público nem de portas publicadas neste exemplo: ele apenas envia dados por HTTPS.

Em **Armazenamento**, configure:

| Tipo | Origem | Destino | Opção |
| --- | --- | --- | --- |
| Bind | `/var/lib/docker/containers` | `/var/lib/docker/containers` | Somente leitura |
| Bind | `/` | `/hostfs` | Somente leitura |
| Volume | `otel-state` | `/var/lib/otelcol` | Leitura e escrita |
| File | Conteúdo de `docker/observability/otel-config.yaml` | `/etc/otelcol-contrib/config.yaml` | Arquivo de configuração |

O mount `/hostfs` permite medir a VPS em vez de apenas o container. O volume
`otel-state` preserva posições de leitura e a fila de envio entre reinicializações.
Se sua versão do EasyPanel não oferecer a opção de mount somente leitura, use
um Compose ou bind mount que a suporte para esses caminhos.

No OpenObserve, abra **Data → Data sources → Custom → Logs → OTEL Collector**.
Copie o valor do header **Authorization** da configuração gerada. Prefira uma
conta de coleta separada, com as permissões de ingestão disponíveis na sua edição.
Esse valor é uma credencial: guarde-o somente no ambiente do servidor.

No **Ambiente** do coletor, configure:

```dotenv
OPENOBSERVE_ENDPOINT=https://observabilidade.seu-dominio.com/api/default
OPENOBSERVE_AUTH=Basic COLE_AQUI_O_BASE64_GERADO_PELO_OPENOBSERVE
OBS_HOST_NAME=minha-vps
GOMEMLIMIT=256MiB
```

O valor de `OPENOBSERVE_AUTH` inclui `Basic`, um espaço e a parte codificada.
O endpoint termina em `/api/default`, sem `/v1/logs`; o exporter acrescenta o
caminho de cada sinal. O coletor usa o domínio HTTPS para não depender de acesso
entre redes de projetos do EasyPanel.

Configure inicialmente limite de **384 MB** e **0,25 CPU**, com **uma réplica**,
e clique em **Implantar**. Examine o log do coletor para erros de permissão,
autenticação ou configuração.

A leitura começa no final dos arquivos: gere uma requisição nova depois da
implantação para validar. Pesquise em **Logs → infraestrutura**. Os registros
incluem `log.file.path`, que identifica o container; use `docker ps --no-trunc`
para relacionar o ID ao nome. Esta configuração inicial não enriquece
automaticamente cada log com o nome do projeto do EasyPanel.

Em **Metrics**, procure métricas como `system.cpu.time`, `system.memory.usage`
e `system.filesystem.usage` após aproximadamente dois minutos. Esta etapa mede
o host; métricas individuais dos containers exigem um receiver Docker adicional.

## 5. Rastrear chamadas do backend do BPS

Esta etapa exige mudança no projeto e uma nova implantação; só definir variáveis
no EasyPanel não instrumenta o Django. As instruções abaixo descrevem a alteração,
mas não a aplicam ao backend existente.

Adicione as dependências OpenTelemetry compatíveis ao `backend/requirements.txt`
e fixe as versões após validar o conjunto:

```text
opentelemetry-distro
opentelemetry-exporter-otlp-proto-http
opentelemetry-instrumentation-django
opentelemetry-instrumentation-httpx
opentelemetry-instrumentation-psycopg2
```

No serviço **backend** do EasyPanel, adicione:

```dotenv
OTEL_SERVICE_NAME=bps-backend
OTEL_RESOURCE_ATTRIBUTES=service.namespace=bps,deployment.environment.name=production
OTEL_TRACES_EXPORTER=otlp_proto_http
OTEL_METRICS_EXPORTER=none
OTEL_LOGS_EXPORTER=none
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=https://observabilidade.seu-dominio.com/api/default
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic%20COLE_AQUI_APENAS_O_BASE64
OTEL_TRACES_SAMPLER=parentbased_always_on
```

Aqui o espaço entre `Basic` e o token está codificado como `%20`, pois os headers
do SDK usam formato codificado em URL. Logs continuam sendo coletados pelo Docker.
O sampler registra todos os traces iniciados pelo backend, mas respeita a decisão
de amostragem de um trace recebido; não é garantia de captura de todo tráfego.

Em `docker/backend/entrypoint.sh`, preserve as etapas de migrations e collectstatic
e substitua somente a chamada final ao Gunicorn por:

```sh
exec opentelemetry-instrument gunicorn bps_core.wsgi:application \
  --bind 0.0.0.0:${PORT:-8000} \
  --workers ${GUNICORN_WORKERS:-3} \
  --timeout ${GUNICORN_TIMEOUT:-120} \
  --access-logfile - \
  --error-logfile -
```

No BPS, o entrypoint define esse comando diretamente; trocar apenas o campo
Command no EasyPanel não substitui essa linha do script.

Após implantar o código atualizado, use uma rota da aplicação que consulte o banco
e outra que chame a IA. Em **Traces**, filtre pelo serviço `bps-backend` e confira
as etapas Django, PostgreSQL e HTTPX. A instrumentação da chamada externa mostra
o lado do seu app, não o processamento interno do fornecedor. Custos e tokens da
IA exigem coleta específica adicional.

Repita a instrumentação adequada à linguagem/framework do SaaS, com outro
`OTEL_SERVICE_NAME` e `service.namespace`. Não presuma Django no segundo projeto.

## 6. Navegador, alertas e deploys

Para o React, abra **Data → Data sources → Recommended → Real User Monitoring**
e escolha **Browser/Web**. Use o snippet gerado, instalando
`@openobserve/browser-rum` e `@openobserve/browser-logs`, inicializado cedo na
entrada do frontend. No BPS, isso fica junto à inicialização de `src/main.tsx`.
Use o **RUM client token** específico do navegador, HTTPS, serviço `bps-frontend`,
e ambiente `production`. Mantenha session replay desligado inicialmente.
Não coloque senha root nem o header Authorization do coletor em variáveis VITE.

No BPS atual, apenas duas variáveis são injetadas em runtime pelo Nginx:
`VITE_API_URL` e `VITE_MEDIA_BASE_URL`. Novas variáveis para observabilidade
precisam ser ligadas explicitamente à configuração do frontend. Para correlacionar
o navegador com traces Django, configure também a propagação W3C no SDK e os
headers CORS correspondentes no backend; instalar RUM sozinho não conclui essa ligação.

Depois de visualizar os dados reais, crie alertas de pouco espaço livre em disco,
memória disponível baixa, erros HTTP 5xx e aumento de latência. Escolha os campos
e métricas que efetivamente chegaram e configure um destino de notificações.

Os logs dos containers e traces não substituem o histórico de **build/deploy** do
EasyPanel. Saídas de ações de implantação precisam de integração de coleta própria.
Também é necessário configurar rotação dos logs Docker separadamente: a retenção
de sete dias no OpenObserve não apaga os arquivos originais do Docker.

## Referências

- [EasyPanel: App Service](https://easypanel.io/docs/services/app)
- [OpenObserve: instalação](https://openobserve.ai/docs/getting-started/)
- [OpenObserve: variáveis de ambiente](https://openobserve.ai/docs/administration/configuration/environment-variables/)
- [OpenObserve: release v1.1.0](https://github.com/openobserve/openobserve/releases/tag/v1.1.0)
- [OpenObserve: ingestão OTLP](https://openobserve.ai/docs/ingestion/logs/otlp/)
- [OpenTelemetry: File Log receiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.165.0/receiver/filelogreceiver)
- [OpenTelemetry: Host Metrics receiver](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/v0.165.0/receiver/hostmetricsreceiver)
- [OpenTelemetry: OTLP HTTP exporter](https://github.com/open-telemetry/opentelemetry-collector/tree/v0.165.0/exporter/otlphttpexporter)
- [OpenTelemetry: instrumentação Python](https://opentelemetry.io/docs/zero-code/python/)
- [OpenObserve: RUM](https://openobserve.ai/docs/user-guide/data-exploration/rum/setup/)
