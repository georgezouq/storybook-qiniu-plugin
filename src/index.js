const url = require('url');
const request = require('request-promise');
const path = require('path');
const revalidator = require('revalidator');
const mm = require('micromatch');
const chalk = require('chalk');

const Qiniu = require('./qiniu');
const { combineFiles, mapLimit } = require('./utils');
const Reporter = require('./reporter');

const LOG_FILENAME = '__qiniu__webpack__plugin__files.json';
const CONFIG_FILENAME = '.qiniu_webpack';
const PLUGIN_NAME = 'QiniuWebpackPlugin';

/**
 * options: {
 *    accessKey: string, @required
 *    secretKey: string, @required
 *    bucket: string, @required
 *    bucketDomain: string, @required
 *    matchFiles: [],
 *    uploadPath: string,
 *    usePublicPath: boolean,
 *    batch: number,
 *    deltaUpdate: boolean,
 * }
 */
class QiniuPlugin {
  constructor(options = { }) {    
    const defaultOptions = {
      uploadPath: 'webpack_assets', // default uploadPath
      batch: 10,
      deltaUpdate: true,
      usePublicPath: true
    };
    const fileOptions = this.getFileOptions();
    this.options = Object.assign(defaultOptions, options, fileOptions);

    this.validateOptions(this.options);

    let { uploadPath } = this.options;

    if (uploadPath[0] === '/') {
      this.options.uploadPath = uploadPath.slice(1, uploadPath.length);
    }

    const { accessKey, secretKey, bucket, bucketDomain } = this.options;
    this.publicPath = url.resolve(bucketDomain, uploadPath);  // domain + uploadPath
    this.qiniu = new Qiniu({
      accessKey,
      secretKey,
      bucket,
      domain: bucketDomain
    })
  }

  validateOptions(options) {
    let validate = revalidator.validate(options, {
      properties: {
        accessKey: {
          type: 'string',
          required: true
        },
        secretKey: {
          type: 'string',
          required: true
        },
        bucket: {
          type: 'string',
          required: true,
          minLength: 4,
          maxLength: 63
        },
        bucketDomain: {
          type: 'string',
          required: true,
          message: 'is not a valid url',
          conform (v) {
            let urlReg = /[-a-zA-Z0-9@:%_\+.~#?&//=]{1,256}\.[a-z]{1,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
            if (urlReg.test(v)) {
              return true;
            }
            return false;
          }
        },
        uploadPath: {
          type: 'string'
        },
        matchFiles: {
          type: 'array'
        },
        batch: {
          type: 'number'
        },
        deltaUpdate: {
          type: 'boolean'
        }
      }
    });

    if (!validate.valid) {
      const { errors } = validate; 
      console.log(chalk.bold.red('[QiniuWebpackPlugin] options validate failure:'));
      for(let i = 0, len = errors.length; i < len; i++) {
        const error = errors[i];
        console.log('\n    > ', error.property, error.message);
      }
      console.log('\n');
      process.exit();
    }
  }

  apply (compiler) {
    const beforeRunCallback = (compiler, callback) => {
      // TODO: ?????? output.filename ????????? hash ??????
      const { usePublicPath } = this.options;
      if (usePublicPath) {
        compiler.options.output.publicPath = this.publicPath;
      }
      callback();
    }
    
    const afterEmitCallback = async (compilation, callback) => {
      const fileNames = Object.keys(compilation.assets);
      console.log('\n');
      console.log(chalk.bold.green('==== Qiniu Webpack Plugin ==== \n'));
      const reporter = new Reporter('\n');

      // ??????????????????
      const releaseFiles = this.matchFiles(fileNames);

      reporter.text = '????   ????????????????????????';
      
      // ??????????????????
      const {
        uploadTime,
        prev: prevFiles = [],
        current: currentFiles = []
      } = await this.getLogFile();
      reporter.log = '????   ??????????????????';
      
      // ??????????????????????????????????????????????????????
      const { uploadFiles, deleteFiles } = combineFiles(prevFiles, currentFiles, releaseFiles);
      
      reporter.log = `????   ????????? ${uploadFiles.length} ?????????`;
      
      const uploadFileTasks = uploadFiles.map((filename, index) => {
        const file = compilation.assets[filename];

        return async () => {
          const key = path.posix.join(this.options.uploadPath, filename);
          reporter.text = `????  ??????????????? ${index + 1} ?????????: ${key}`;
          
          return await this.qiniu.putFile(key, file.existsAt || path.resolve('./', 'storybook-static', filename.split('?')[0]));
        }
      });
      
      try {
        await mapLimit(uploadFileTasks, this.options.batch,
          (task, next) => {
            (async () => {
              try {
                const res = await task();
                next(null, res);
              } catch(err) {
                next(err);
              }
            })();
          }
        );
      } catch(e) {
        console.error(chalk.bold.red('\n\n????????????:'));
        callback(e);
      }

      reporter.log = '??????   ????????????';

      // ????????????????????????????????????????????????????????????????????????
      if (uploadFiles.length > 0 && !this.options.deltaUpdate) {

        if (deleteFiles.length > 0) {
          reporter.log = `????????   ????????? ${deleteFiles.length} ?????????`;
          reporter.text = `????   ??????????????????...`;
          await this.deleteOldFiles(deleteFiles);
          reporter.log = `????   ????????????`;  
        }
      }

      reporter.text = `????   ??????????????????...`;
      await this.writeLogFile(currentFiles, releaseFiles);
      reporter.log = `????   ??????????????????`

      reporter.succeed('???? \n');
      console.log(chalk.bold.green('==== Qiniu Webpack Plugin ==== \n'));

      callback();
    }
    
    if (compiler.hooks) {
      compiler.hooks.beforeRun.tapAsync(PLUGIN_NAME, beforeRunCallback);
      compiler.hooks.afterEmit.tapAsync(PLUGIN_NAME, afterEmitCallback);
    } else {
      compiler.plugin('before-run', beforeRunCallback);
      compiler.plugin('after-emit', afterEmitCallback);
    }

  }

  matchFiles(fileNames) {
    const { matchFiles = [] } = this.options;

    matchFiles.unshift('*'); // all files

    return mm(fileNames, matchFiles, { matchBase: true });
  }
  
  getFileOptions() {
    try {
      return require(path.resolve(CONFIG_FILENAME));
    } catch(e) {
      if (e.code !== 'MODULE_NOT_FOUND') {
        throw e;
      }
      return null;
    }
  }
  
  /**
   * ??????????????????
   * @param {Array<string>} deleteFiles ?????????????????????
   */
  async deleteOldFiles(deleteFiles) {
    if (deleteFiles.length > 0) {
      const keys = deleteFiles.map((filename, index) => path.posix.join(this.options.uploadPath, filename));
      await this.qiniu.batchDelete(keys);
    }
  }

  /**
   * ??????????????????
   * @param {Array<string>} currentFiles ???????????????????????????
   * @param {Array<string>} releaseFiles ???????????????????????????
   */
  async writeLogFile(currentFiles, releaseFiles) {
    let json = JSON.stringify({
      prev: currentFiles,
      current: releaseFiles,
      uploadTime: new Date()
    });
    const key = path.posix.join(this.options.uploadPath, LOG_FILENAME);
    return await this.qiniu.put(key, json);
  }

  /**
   * ??????????????????
   */
  async getLogFile() {
    let remotePath = path.posix.join(this.options.uploadPath, LOG_FILENAME);
    let logDownloadUrl = this.qiniu.getPublicDownloadUrl(remotePath);

    let randomParams = '?r=' + +new Date();
    
    // ????????????????????????
    // TODO: ?????? ????????????????????????????????? http ?????????????????????????????? https
    if (logDownloadUrl.indexOf('//') === 0) {
      logDownloadUrl = 'http:' + logDownloadUrl;
    }

    return request({
      uri: logDownloadUrl + randomParams,
      json: true
    })
    .catch(err => ({ prev: [], current: [], uploadTime: '' }))
  }

}

module.exports = QiniuPlugin;

