# Grau Livre

Jogo 3D de grau de moto para PC. Você pilota motos reais por uma cidade litorânea brasileira: avenida beira-mar, calçadão de ondas, praia, trânsito e prédios. Dá grau, raspa a rabeta, faz stoppie, corta carros e fecha combos.

## Como rodar

**App desktop (recomendado: GPU dedicada, VSync configurável, FPS livre):**

```bash
npm install
npm start              # compila e abre o jogo (F11 = tela cheia)
npm run dist:win       # gera um .exe portátil em dist/
npm run dist:mac       # .dmg
npm run dist:linux     # AppImage
```

**Navegador:** abra o `index.html` com dois cliques. O bundle já vem compilado em `build/grau.js` e funciona offline. No navegador o FPS fica limitado à taxa do monitor.

## Controles

| Tecla | Ação |
|---|---|
| `W` | Acelerar |
| `Q` / `Ctrl` | Jogar o corpo para trás (levanta e segura o grau) |
| `E` | Jogar o corpo para frente |
| `S` | Freio traseiro (abaixa a frente no grau) |
| `Espaço` | Freio dianteiro (stoppie) |
| `Shift` | Embreagem: segure, acelere e solte para o **grau de embreagem** |
| `A` `D` | Inclinar / virar |
| `Z` `X` | Marchas (câmbio manual) |
| `C` | Câmera: perseguição, perto, lateral, capacete, alta |
| Botão direito do mouse | Girar a câmera |
| `H` | Buzina |
| `R` | Reposicionar |
| `F3` | Contador de FPS |
| `Esc` | Pausa |

Controle de Xbox/PlayStation: RT acelera, LT freio dianteiro, RB/B freio traseiro, LB embreagem, analógico esquerdo vira, analógico direito (vertical) peso do corpo, A/X marchas, Y câmera e Start pausa.

## Motos

As especificações são as de fábrica (aproximadas). A física é derivada delas: potência, torque, peso, velocidade máxima, giro máximo, número de marchas e cilindros.

| Moto | cv | kg | km/h | Motor |
|---|---|---|---|---|
| Honda CG 160 Titan | 15,1 | 122 | 118 | mono |
| Honda NXR 160 Bros | 14,7 | 128 | 115 | mono |
| Honda XRE 300 | 25,6 | 148 | 140 | mono |
| BMW G 310 GS | 34 | 175 | 143 | mono |
| Yamaha XJ6 N | 77,5 | 205 | 215 | 4 em linha |
| Yamaha MT-09 | 119 | 189 | 230 | 3 cilindros |
| Kawasaki Ninja ZX-10R | 203 | 207 | 299 | 4 em linha |
| BMW S 1000 RR | 210 | 197 | 303 | 4 em linha |

Os modelos 3D foram gerados por script no **Blender** (`tools/blender/`), a partir das medidas reais de cada moto: entre-eixos, cáster, aro e medida dos pneus, e altura do banco. Os nomes e as especificações são usados como referência num projeto pessoal. Para distribuir comercialmente, é preciso licenciar marcas e desenhos com os fabricantes.

## Mecânicas

- **Física do grau:** a moto gira em torno do contato do pneu traseiro. O torque do motor, o centro de massa e o peso do piloto decidem se a frente sobe. O ponto de equilíbrio aparece no indicador lateral do HUD (marca verde).
- **Grau de embreagem:** a embreagem patina de verdade. Segurando o motor no alto e soltando a embreagem, o tranco levanta até a CG.
- **Rabeta:** passando do ponto, a rabeta encosta no chão e solta faísca. O ângulo é calculado a partir da geometria de cada moto.
- **Stoppie:** frenagem forte no freio dianteiro faz a moto girar no pneu da frente.
- **Motor:** curva de torque, marchas reais, corte de giro e tração limitada pelo peso no pneu traseiro (cantar pneu e burnout).
- **Combos:** grau, ponto de equilíbrio, rabeta, stoppie, grau de giro, corte em carro, grau a 100+, burnout e grau de embreagem. Cada manobra nova aumenta o multiplicador.
- **Missões em sequência:** pagam em dinheiro para comprar motos e preparações (motor, escape, relação, pneus, suspensão).
- **Assistência:** no modo *Assistido* é mais fácil empinar e equilibrar. *Simulação* é só física.

## Gráficos e desempenho

- Céu físico com nuvens e ciclo dia/noite, sol e lua, neblina de altura com espalhamento do sol e iluminação por ambiente (IBL).
- Pós-processamento: oclusão de ambiente (N8AO), bloom, SMAA, tone mapping AgX, color grading cinematográfico, vinheta e motion blur por velocidade.
- Prédios com shader de fachada próprio: janelas com interior em profundidade (interior mapping), vidro refletivo, cômodos acesos à noite, lojas e néon.
- Texturas PBR geradas na GPU ao iniciar: asfalto, concreto, calçadão de ondas, areia e grama.
- Mar com ondas e espuma na arrebentação, palmeiras balançando com o vento e postes com halo de luz à noite.
- Otimizações para alto FPS:
  - materiais empacotados por vértice (a moto inteira em poucas chamadas de desenho);
  - instanciamento por distância, com sombra só no que está perto;
  - trânsito instanciado;
  - física em passo fixo de 240 Hz;
  - resolução dinâmica que segura o FPS alvo.
- Presets Baixo, Médio, Alto e Ultra, FPS alvo de 60 a 240 ou livre e escala de resolução.

## Estrutura

```
src/core      renderizador, pós-processamento, entrada, áudio, empacotamento de materiais
src/world     atmosfera, texturas, cidade, fachadas, props, trânsito
src/vehicle   física da moto, modelo + piloto com IK
src/game      dados das motos, câmera, manobras, efeitos
src/ui        HUD, menus, garagem, configurações
tools/blender geração dos modelos 3D (motos, piloto, carros, palmeira, poste, semáforo)
tests         testes da física (npm test)
```

## Desenvolvimento

```bash
npm run build          # recompila build/grau.js
npm run watch          # recompila ao salvar
npm test               # testes da física
BLENDER_PY=/caminho/python-com-bpy npm run models   # regera os modelos 3D (pip install bpy)
```
