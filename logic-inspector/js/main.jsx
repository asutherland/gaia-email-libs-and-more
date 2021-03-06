/**
 * This class is the entry point for logic-inspector. Based upon the JSON test
 * results we stored (passed through loggest-chrome-runner.js in GELAM) in the
 * static HTML file in which we're running, we either show the index view (a
 * list of all test runs) or a test-run-specific page showing all the logs from
 * one test suite.
 */


import React from 'react';
import ReactDOM from 'react-dom';

import { SuiteResults, EventList } from './components/test-suite-results';
import { TestRunList } from './components/test-runs-index';

import { JsonIndexPoller } from './log_sourcers/json_index_poller';
import { fetchDetectExtract } from './log_extractors/fetch_detect_extract';

class LogicInspector extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      indexData: [],
      href: null,
      autoReload: true,
      serial: 0,
      /**
       * Hacky indicator of whether we should only show log events from the most
       * recent event with type "START_OF_LOG".
       */
      mostRecentSessionOnly: true,
      data: null
    };

    this.poller = null;
  }

  onClick(event) {
    var target = event.target;
    do {
      if (target.href) {
        if (target.href[0] === '?') {
          event.preventDefault();
          this.navigate(target.href);
        }
        return;
      }
    } while ((target = target.parentNode));
  }

  shouldComponentUpdate(nextProps, nextState) {
    // We know that indexData is append-only, so we can fast-path here.
    if (this.state.href === nextState.href &&
        this.state.autoReload === nextState.autoReload &&
        this.state.data === nextState.data &&
        this.state.serial === nextState.serial &&
        this.state.indexData.length === nextState.indexData.length) {
      return false;
    } else {
      return true;
    }
  }

  componentWillMount() {
    // TODO: better handle the multiple potential modes of operation.
    this.poller = new JsonIndexPoller({
      // This will fire at least once even if we don't make it active.
      onNewData: this._indexUpdated.bind(this),
      active: this.state.autoReload
    });

    window.onpopstate = () => {
      this.navigate(document.location.href);
    };

    this.navigate(document.location.href, /* isRefresh: */ true);
  }

  _indexUpdated(indexData) {
    this.setState({ indexData: indexData });

    // If we're viewing test suite results, maybe reload it.
    if (this.state.href && this.state.data && this.state.autoReload) {
      var latestHref = null;
      indexData.some((testRunSummary) => {
        return testRunSummary.suites.some((result) => {
          if (result.filename === this.state.data.filename &&
              result.variant === this.state.data.variant) {
            latestHref = result.href;
            return true; // break out!
          }
        });
      });
      if (latestHref !== this.state.href) {
        console.log('Loading new results:', latestHref);
        this.navigate('?href=' + latestHref, /* isRefresh: */ true);
      }
    }
  }

  componentDidUpdate() {
    if (this.state.autoReload && !this.poller) {
      this.poller = new JsonIndexPoller(this._indexUpdated.bind(this));
    }
    if (!this.state.autoReload && this.poller) {
      this.poller.stop();
      this.poller = null;
    }
  }

  componentWillUnmount() {
    if (this.poller) {
      this.poller.stop();
    }
  }

  navigate(url, isReload) {
    url = new URL(url);
    const href = url.searchParams.get('href');
    const autoReload = !url.searchParams.get('noreload');
    const viaBroadcast = !!url.searchParams.get('broadcast');
    this.setState({
      href,
      autoReload,
      viaBroadcast,
    });

    var normalizedUrl = '?' +
                        (href ? 'href=' + href : '') +
                        (viaBroadcast ? '&broadcast=true' : '') +
                        (autoReload ? '' : '&noreload=true');
    if (isReload) {
      history.replaceState(null, '', normalizedUrl);
    } else {
      history.pushState(null, '', normalizedUrl);
    }

    if (href) {
      fetchDetectExtract(href).then(({ data, dataType }) => {
        if (dataType === 'raw-logic-events' &&
            this.state.mostRecentSessionOnly) {
          data = this.filterToMostRecentSessionOnly(data);
        }
        this.setState({ data, dataType });
      }, (ex) => {
        console.error('Problem fetching/extracting:', ex);
      });
    }

    // We support BroadcastChannel delivery of logs so that refreshing the app
    // UI via page reload can still send logs to the existing log window UI
    // without requiring a window.open() to happen every time.
    if (viaBroadcast) {
      let data = [];
      let serial = 0;
      const dataType = 'raw-logic-events';

      this.setState({ data, dataType });

      let pendingTimeout = null;

      const timeoutFired = () => {
        pendingTimeout = null;
        this.setState({ data, serial });
      };

      this.BC = new BroadcastChannel('logic');
      this.BC.onmessage = (evt) => {
        if (evt.data.mode === 'clear') {
          data = [];
          serial++;
          this.setState({ data, serial });
          return;
        }
        if (evt.data.mode !== 'append') {
          return;
        }
        serial++;
        data.push(evt.data.event);

        if (pendingTimeout) {
          return;
        }

        pendingTimeout = setTimeout(timeoutFired, 10);
      }
    }
  }

  filterToMostRecentSessionOnly(unfiltered) {
    let filtered = [];
    for (let event of unfiltered) {
      if (event.type === 'START_OF_LOG') {
        filtered = [];
      }
      filtered.push(event);
    }
    return filtered;
  }

  render() {
    if (this.state.data || this.state.href) {
      // -- Displaying a specific log
      return this.renderLog();
    } else {
      // -- Want an index
      return this.renderIndex();
    }
  }

  renderLog() {
    let { data, dataType } = this.state;
    if (!data) {
      return null; // wait for it to load
    }

    switch (dataType) {
      case 'gelam-test':
        return this.renderTestLog();
      case 'raw-logic-events':
        return this.renderRawEvents();
      default:
        return (
          <div>Unknown data type: { dataType }</div>
        );
    }
  }

  renderTestLog() {
    var data = this.state.data;
    var variant = data.tests[0] && data.tests[0].variant;
    var result = data.tests.every((t) => t.result === 'pass') ? 'pass' : 'fail';
    return (
      <div onClick={this.onClick.bind(this)}>
        <div className={['autoreload-info',
                        this.state.autoReload ? 'reload' : 'noreload'].join(' ')}></div>

        <a className="index-link" href="?">
        &larr; All Test Results</a>
        <SuiteResults filename={data.filename}
                      variant={variant}
                      result={result}
                      tests={data.tests}/>
      </div>
    );
  }

  renderRawEvents() {
    let data = this.state.data;
    return (
      <div>
        <EventList events={ data } />
      </div>
    );
  }

  renderIndex() {
    var items = this.state.indexData;
    return (
      <div onClick={this.onClick.bind(this)}>
        <div className="index-header">
          <strong>Recent GELAM Test Runs</strong> <em>(Automatically reloads.)</em>
        </div>
        <TestRunList items={items} />
      </div>
    );
  }
}

ReactDOM.render(<LogicInspector />, document.getElementById('content'));
