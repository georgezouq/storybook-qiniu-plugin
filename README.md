﻿# Storybook Qiniu CDN

> 改造自 [better-qiniu-webpack-plugin](https://github.com/zzetao/qiniu-webpack-plugin)，支持将 StoryBook 的 Bundle 文件 上传至七牛CDN

## 功能

- 支持并行上传
- 保留上一版本文件
- 智能分析，不重复上传

## 安装

```Bash
yarn add storybook-qiniu-webpack-plugin --dev
```


## 使用

**.storybook/main.js**

```Javascript
const StorybookQiniuWebpackPlugin = require('storybook-qiniu-webpack-plugin');

module.exports = {
  webpackFinal: async (config, { configType }) => {
    config.plugins.push(new StorybookQiniuWebpackPlugin({
      accessKey: '', // required
      secretKey: '', // required
      bucket: '', // required
      bucketDomain: '', // required
      matchFiles: ['!*.html', '!*.map'],
      uploadPath: '/',
      usePublicPath: true,
      batch: 10,
      deltaUpdate: true
    }))
  }
}
```

在项目目录下新建 `.qiniu_webpack` 文件，并且在 `.gitignore` 忽略此文件

**.qiniu_webpack**

```Javascript
module.exports = {
  accessKey: 'qiniu access key', // required
  secretKey: 'qiniu secret key', // required
  bucket: 'demo', // required
  bucketDomain: 'https://domain.bkt.clouddn.com', // required
  matchFiles: ['!*.html', '!*.map'],
  uploadPath: '/assets',
  usePublicPath: true,
  batch: 10,
  deltaUpdate: true
}
```

**Options**

|Name|Type|Default|Required|Description|
|:--:|:--:|:-----:|:-----:|:----------|
|**[`accessKey`](#)**|`{String}`| | true |七牛 Access Key|
|**[`secretKey`](#)**|`{String}`| | true |七牛 Secret Key|
|**[`bucket`](#)**|`{String}`| | true |七牛 空间名|
|**[`bucketDomain`](#)**|`{String}`| | true |七牛 空间域名|
|**[`matchFiles`](#)**|`{Array[string]}`| ['*'] | false |匹配文件/文件夹，支持 include/exclude|
|**[`uploadPath`](#)**|`{string}`| /webpack_assets | false |上传文件夹名|
|**[`usePublicPath`](#)**|`{Boolean}`| true | false |默认会使用 bucketDomain + uploadPath，来设置 webpack publicPath|
|**[`batch`](#)**|`{number}`| 10 | false |同时上传文件数|
|**[`deltaUpdate`](#)**|`{Boolean}`| true | false |是否增量构建|

- `bucketDomain` 支持不携带通信协议: `//domain.bkt.clouddn.com`
- `matchFiles` 匹配相关文件或文件夹，详细使用请看: [micromatch](https://github.com/micromatch/micromatch)
  - `!*.html` 不上传文件后缀为 `html` 的文件
  - `!assets/**.map` 不上传 `assets` 文件夹下文件后缀为 `map` 的文件



***


## License

Copyright ©, [zzetao](https://github.com/zzetao).
Released under the [MIT License](LICENSE).
