const path = require('node:path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

/**
 * Build/serve do harness de pré-visualização local (não é a extensão distribuída).
 * `pnpm --filter @chora/extension preview` → dev-server em http://localhost:3000
 */
module.exports = {
  entry: { preview: './preview/preview.tsx' },
  output: { path: path.resolve(__dirname, 'preview-dist'), filename: '[name].js', clean: true },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: path.resolve(__dirname, 'tsconfig.preview.json') } },
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'CHORA+ · pré-visualização',
      templateContent: '<!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="raiz"></div></body></html>',
    }),
  ],
  devServer: {
    static: false,
    port: 3000,
    host: '0.0.0.0',
    allowedHosts: 'all',
  },
};
