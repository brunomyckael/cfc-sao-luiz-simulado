# Relatório — Fase 5B: Integração e QA

Data: 24/09/2026

## Resultado geral

**Status: APROVADO COM OBSERVAÇÃO**

A auditoria estrutural e a integração foram verificadas. Durante o teste foi encontrado um problema real nos caminhos das imagens das placas: o `index.html` usava caminhos `placas/...`, enquanto os arquivos estavam originalmente em `placas_pdf/...`.

Foi criada no GitHub a estrutura `placas/` reaproveitando os mesmos blobs das imagens existentes. Isso preserva o `index.html` e faz os caminhos esperados passarem a existir.

## Testes realizados

| Teste | Resultado |
|---|---|
| Banco com 1.500 questões | PASSOU |
| 4 alternativas por questão | PASSOU |
| Índices de resposta válidos | PASSOU |
| IDs duplicados | PASSOU — nenhum encontrado |
| 227 questões com associação de placa | PASSOU |
| 88 códigos de placa efetivamente utilizados | PASSOU |
| Imagem A-33a disponível no caminho esperado | PASSOU |
| Imagem R-25b disponível no caminho esperado | PASSOU |
| TNA-06 disponível | PASSOU |
| JavaScript — `node --check` | PASSOU |
| CSS responsivo para telas menores | PASSOU na inspeção estática |
| Estrutura para PC | PASSOU na inspeção estática |
| Estrutura para celular | PASSOU na inspeção estática |
| GitHub `main` atualizado | PASSOU |
| GitHub Pages — renderização visual automatizada | NÃO CONCLUSIVO |

## Responsividade

Foram encontradas regras específicas para telas de até 650px, incluindo redução de padding, alteração do tamanho da fonte das questões, grids adaptados, quiz em 100% da largura, ajustes de cronômetro e adaptação dos componentes de desempenho.

A versão está preparada para celular, mas não foi possível executar um teste visual automatizado real em Safari/Chrome mobile nesta execução.

## Correção aplicada

Foi criado o diretório `placas/`, contendo as placas regulamentares e de advertência utilizadas pelo banco. As imagens foram reutilizadas pelos mesmos blobs já presentes no repositório, evitando duplicação desnecessária.

Exemplos verificados:

- `placas/A-33a.png`
- `placas/R-25b.png`
- `placas_pdf/TNA06.png`
- `placas_pdf/SAU19.png`

## GitHub

Novo commit da correção:

`e7596b72f4acc9bb4bad5c5dbeb03f6d1eb3b743`

Mensagem: `Corrigir caminhos das imagens das placas e validar integração 5B`

A branch `main` foi atualizada para esse commit.

## Observação

A parte de PC/celular foi validada estruturalmente. Não considero correto afirmar que houve teste visual completo em dispositivos reais porque não houve navegador mobile/desktop automatizado disponível nesta execução.

Portanto, a Fase 5B está tecnicamente integrada e corrigida, mas recomenda-se uma última conferência visual manual no iPhone e no PC antes de declarar a fase 100% encerrada.
