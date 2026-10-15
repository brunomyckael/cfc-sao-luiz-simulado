# Acessos e visitas do site

O site usa uma configuração compatível com hospedagem estática. O Google Analytics 4 (GA4) não envia dados enquanto o identificador da propriedade não for configurado. Quando configurado, a tag só é carregada para visitantes que aceitarem a análise no aviso de privacidade; a escolha pode ser alterada em **Privacidade**, no canto inferior da página.

## Ativar a coleta

1. Entre em [Google Analytics](https://analytics.google.com/) com a conta Google que deve ser proprietária dos dados.
2. Crie ou selecione uma propriedade GA4 para **Simulado CNH Goiás**. Configure o fuso horário como **Brasil — Brasília** e a moeda como **BRL**.
3. Em **Administrador → Coleta e modificação de dados → Fluxos de dados → Web**, crie um fluxo para `https://simuladocnhgoias.com.br`.
4. Copie o **ID de métricas**, no formato `G-XXXXXXXXXX`.
5. Edite `ga4-config.js` e substitua o valor vazio pelo ID verdadeiro. O ID de métricas é público por projeto; não coloque senhas, chaves de API nem credenciais nesse arquivo.
6. Publique a alteração no branch `main` do repositório. O GitHub Pages publica o site automaticamente.
7. Abra o site, aceite a análise e confira **Relatórios → Tempo real** no GA4. A primeira coleta pode levar algum tempo para aparecer.

## Onde ver os dados

No [Google Analytics](https://analytics.google.com/), selecione a propriedade do site:

- **Visitas e usuários ativos agora:** Relatórios → Tempo real.
- **Páginas mais acessadas:** Relatórios → Engajamento → Páginas e telas.
- **Origem dos acessos:** Relatórios → Aquisição → Aquisição de tráfego.
- **Período:** use o seletor de datas no canto superior direito dos relatórios.

Os relatórios só começam a contar depois da instalação e do consentimento do visitante; não há dados anteriores nem números de demonstração. A tela Tempo real inclui usuários ativos nos últimos 5 e 30 minutos. Os relatórios padrão podem levar até 24 horas para processar dados novos. Este site é uma aplicação de página única: as páginas HTML publicadas (simulado, sobre, política e termos) são contadas como páginas; mudanças internas de telas do simulado não são registradas como novas páginas.

O aviso registra uma escolha local no navegador por até 180 dias. Recusar impede o carregamento da tag GA4. A decisão pode ser alterada no botão **Privacidade**. A política do site descreve o tratamento de dados de análise.
