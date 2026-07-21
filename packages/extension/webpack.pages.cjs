const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/**
 * Build da demonstração estática para GitHub Pages. Gera HTML + bundle em
 * `pages-dist/`, com caminhos relativos (`publicPath: ''`) para funcionar em
 * qualquer subcaminho de `utilizador.github.io/repo/`.
 */
module.exports = {
  entry: { app: './pages/pages.tsx' },
  output: {
    path: path.resolve(__dirname, 'pages-dist'),
    filename: 'app.[contenthash].js',
    publicPath: '',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: path.resolve(__dirname, 'tsconfig.pages.json') } },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'CHORA+ · demonstração',
      templateContent:
        '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>CHORA+ · demonstração</title></head><body><div id="raiz"></div></body></html>',
    }),
  ],
  performance: { hints: false },
};
