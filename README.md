# Grau Livre

Jogo 3D de grau de moto para desktop. Você anda pela cidade, empina a moto, segura o equilíbrio,
passa raspando nos carros e ganha dinheiro para comprar e melhorar motos.

Feito em HTML5 + [three.js](https://threejs.org) (incluído em `vendor/`). Funciona offline.

## Como jogar

**Opção 1: navegador (mais rápido).** Abra o `index.html` com dois cliques (Chrome, Edge ou Firefox).

**Opção 2: app desktop (Electron)**, para Windows, macOS ou Linux:

```bash
npm install
npm start            # abre o jogo em janela própria (F11 = tela cheia)
npm run dist:win     # gera um .exe portátil em dist/
npm run dist:mac     # gera um .dmg
npm run dist:linux   # gera um AppImage
```

## Controles

| Tecla | Ação |
|---|---|
| `W` / `↑` | Acelerar (também ajuda a levantar a frente) |
| `Espaço` | Puxar o grau |
| `S` / `↓` | Freio traseiro: abaixa a frente / freia |
| `A` `D` / `←` `→` | Virar |
| `C` | Câmera: atrás, lateral, alta, primeira pessoa |
| `N` | Dia / noite |
| `R` | Reposicionar |
| `M` | Som |
| `Esc` | Pausa |

Controle (Xbox/PlayStation): RT acelera, LT freia, A puxa o grau, analógico vira, Y troca a câmera, X reposiciona e START pausa.

## Mecânicas

- **Física do grau.** O ponto de equilíbrio fica perto de 70°. Acima de 95° a moto cai pra trás. O freio traseiro salva o grau.
- **Zona do grau (45°–80°).** Pontua em dobro. O multiplicador sobe a cada 3 s seguidos de grau, até x10.
- **Raspadas.** Passar perto de um carro durante o grau dá bônus. Bater é queda.
- **Missões em sequência.** Tempo, distância, zona, velocidade, raspadas e pontos. Ficam mais difíceis a cada ciclo.
- **Garagem.** 4 motos, 3 melhorias por moto (motor, equilíbrio, freio) com 5 níveis cada, e 10 cores de pintura.
- **Cidade.** Cidade procedural com trânsito que freia atrás de você, praça de treino com cones, ciclo dia/noite com faróis e janelas acesas, e minimapa.
- **Som.** Ronco de motor sintetizado, com marchas e vento.
- **Progresso.** Salvo automaticamente (localStorage).
