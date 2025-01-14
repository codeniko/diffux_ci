'use strict';

window.diffux = {
  defined: {},
  fdefined: [],
  currentRenderedElement: undefined,
  errors: [],

  define: function(description, func, options) {
    // Make sure we don't have a duplicate description
    if (this.defined[description]) {
      throw 'Error while defining "' + description +
        '": Duplicate description detected'
    }
    this.defined[description] = {
      description: description,
      func: func,
      options: options || {}
    };
  },

  fdefine: function(description, func, options) {
    this.define(description, func, options); // add the example
    this.fdefined.push(description);
  },

  /**
   * @return {Array.<Object>}
   */
  getAllExamples: function() {
    var descriptions = this.fdefined.length ?
      this.fdefined :
      Object.keys(this.defined);

    return descriptions.map(function(description) {
      var example = this.defined[description];
      // We return a subset of the properties of an example (only those relevant
      // for diffux_runner.rb).
      return {
        description: example.description,
        options: example.options,
      };
    }.bind(this));
  },

  handleError: function(currentExample, error) {
    console.error(error);
    return {
      description: currentExample.description,
      error: error.message
    };
  },

  /**
   * @param {Function} func The diffux.describe function from the current
   *   example being rendered. This function takes a callback as an argument
   *   that is called when it is done.
   * @return {Promise}
   */
  tryAsync: function(func) {
    return new Promise(function(resolve, reject) {
      // Safety valve: if the function does not finish after 3s, then something
      // went haywire and we need to move on.
      var timeout = setTimeout(function() {
        reject(new Error('Async callback was not invoked within timeout.'));
      }, 3000);

      // This function is called by the example when it is done executing.
      var doneCallback = function(elem) {
        clearTimeout(timeout);

        if (!arguments.length) {
          return reject(new Error(
            'The async done callback expects the rendered element as an ' +
            'argument, but there were no arguments.'
          ));
        }

        resolve(elem);
      };

      func(doneCallback);
    });
  },

  /**
   * Clean up the DOM for a rendered element that has already been processed.
   * This can be overridden by consumers to define their own clean out method,
   * which can allow for this to be used to unmount React components, for
   * example.
   *
   * @param {Object} renderedElement
   */
  cleanOutElement: function(renderedElement) {
    renderedElement.parentNode.removeChild(renderedElement);
  },

  /**
   * This function is called from Ruby asynchronously. Therefore, we need to
   * call doneFunc when the method has completed so that Ruby knows to continue.
   *
   * @param {String} exampleDescription
   * @param {Function} doneFunc injected by driver.execute_async_script in
   *   diffux_ci/runner.rb
   */
  renderExample: function(exampleDescription, doneFunc) {
    try {
      var currentExample = this.defined[exampleDescription];
      if (!currentExample) {
        throw new Error(
          'No example found with description "' + exampleDescription + '"');
      }

      // Clear out the body of the document
      if (this.currentRenderedElement) {
        this.cleanOutElement(this.currentRenderedElement);
      }
      while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
      }

      var func = currentExample.func;
      if (func.length) {
        // The function takes an argument, which is a callback that is called
        // once it is done executing. This can be used to write functions that
        // have asynchronous code in them.
        this.tryAsync(func).then(function(elem) {
          doneFunc(this.processElem(currentExample, elem));
        }.bind(this)).catch(function(error) {
          doneFunc(this.handleError(currentExample, error));
        }.bind(this));
      } else {
        // The function does not take an argument, so we can run it
        // synchronously.
        var elem = func();
        doneFunc(this.processElem(currentExample, elem));
      }
    } catch (error) {
      doneFunc(this.handleError(currentExample, error));
    }
  },

  processElem: function(currentExample, elem) {
    try {
      this.currentRenderedElement = elem;

      var rect;
      if (currentExample.options.snapshotEntireScreen) {
        rect = {
          width: window.innerWidth,
          height: window.innerHeight,
          top: 0,
          left: 0,
        };
      } else {
        // We use elem.getBoundingClientRect() instead of offsetTop and its ilk
        // because elem.getBoundingClientRect() is more accurate and it also
        // takes CSS transformations and other things of that nature into
        // account whereas offsetTop and company do not.
        //
        // Note that this method returns floats, so we need to round those off
        // to integers before returning.
        rect = elem.getBoundingClientRect();
      }

      return {
        description: currentExample.description,
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        top: Math.floor(rect.top),
        left: Math.floor(rect.left),
      };
    } catch (error) {
      return this.handleError(currentExample, error);
    }
  }
};

window.addEventListener('load', function() {
  var matches = window.location.search.match(/description=([^&]*)/);
  if (!matches) {
    return;
  }
  var example = decodeURIComponent(matches[1]);
  window.diffux.renderExample(example, function() {});
});

// We need to redefine a few global functions that halt execution. Without this,
// there's a chance that the Ruby code can't communicate with the browser.
window.alert = function(message) {
  console.log('`window.alert` called', message);
};

window.confirm = function(message) {
  console.log('`window.confirm` called', message);
  return true;
};

window.prompt = function(message, value) {
  console.log('`window.prompt` called', message, value);
  return null;
};

window.onerror = function(message, url, lineNumber) {
  window.diffux.errors.push({
    message: message,
    url: url,
    lineNumber: lineNumber
  });
}
