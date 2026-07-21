const path = require('node:path');

/**
 * Build da extensão (secção 4.1). Um bundle por contribuição, servidos pelos
 * HTML em static/. O dev-server (porta 3000) corre com `pnpm dev`.
 */
module.exports = {
  entry: {
    'registo-tempo': './src/paineis/registo-tempo/index.tsx',
    aprovacoes: './src/hubs/aprovacoes/index.tsx',
    'area-gestor': './src/hubs/area-gestor/index.tsx',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    extensionAlias: {
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: { loader: 'ts-loader', options: { transpileOnly: true } },
        exclude: /node_modules/,
      },
    ],
  },
  devServer: {
    static: path.resolve(__dirname, 'static'),
    port: 3000,
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
};
