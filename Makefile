.PHONY: help
help:
	@echo "(this is 'make help')"
	@echo "## BUILDING ##"
	@echo ""
	@echo "make build"
	@echo "  Just build."
	@echo "make clean"
	@echo "  Nuke all build byproducts."
	@echo "make install-into-gaia"
	@echo "  Clean, build and copy tests into gaia"
	@echo ""
	@echo "## FAKE SERVERS (for use by you, not for testing) ##"
	@echo ""
	@echo "make imap-server"
	@echo "  Run the IMAP fake-server"
	@echo "make activesync-server"
	@echo "  Run the ActiveSync fake-server"
	@echo ""
	@echo "## USEFUL STUFF ##"
	@echo ""
	@echo "make autoconfig DOMAIN=example.com"
	@echo ""
	@echo "## TESTING ##"
	@echo ""
	@echo "make tests"
	@echo "  Run all tests"
	@echo "make results"
	@echo "  View detailed test results in a browser"
	@echo ""
	@echo "make one-test SOLO_FILE=test_name.js"
	@echo "  Run one test file (all variants)"
	@echo "make one-test SOLO_FILE=test_name.js TEST_VARIANT=imap:fake"
	@echo "  Run one test file (imap:fake variant)"
	@echo ""
	@echo "make gdb-one-test SOLO_FILE=test_name.js TEST_VARIANT=imap:fake"
	@echo "  Run one test file under gdb.  Set breakpoints, type 'run'"
	@echo ""
	@echo "To enable verbose log output to the console: TEST_LOG_ENABLE=true"

TEST_VARIANT ?= all

rwildcard=$(foreach d,$(wildcard $1*),$(call rwildcard,$d/,$2) $(filter $(subst *,%,$2),$d))

OUR_JS_DEPS := $(rwildcard js/*.js)

.PHONY: install-into-gaia
install-into-gaia: clean build gaia-symlink $(OUR_JS_DEPS)
	rsync --delete -arv --exclude='.git' \
	                    --exclude='.gitignore' \
	                    --exclude='.gitmodules' \
	                    --exclude='.jshintrc' \
	                    --exclude='Gruntfile.js' \
	                    --exclude='LICENSE' \
	                    --exclude='Makefile' \
	                    --exclude='NOTICE' \
	                    --exclude='package.json' \
	                    --exclude='README.*' \
	                    --exclude='*.md' \
	                    --exclude='examples' \
	                    --exclude='test' \
	                    --exclude='ext/rdplat' \
	                    js/ gaia-symlink/apps/email/js/ext/

.PHONY: build
build: $(OUR_JS_DEPS)
	git submodule update --init --recursive
	node scripts/sync-js-ext-deps.js

docs:
	rm -rf built_docs
	./node_modules/.bin/jsdoc -r --verbose -a all -c jsdoc-conf.json --lenient -d built_docs

.PHONY: download-b2g
download-b2g: b2g

gaia-symlink:
	echo "You need to create a symlink 'gaia-symlink' pointing at the gaia dir"

SYS=$(shell uname -s)
B2GBD := b2g-builddir-symlink
ifeq ($(wildcard b2g-bindir-symlink),)
	B2GBIND := $(B2GBD)/dist/bin
	RUNB2G := $(B2GBIND)/b2g
else
	# OS X has trouble launching the executable via the symlink, gets a "Couldn't
	# load XPCOM" error, so resolve the symlink first. Do not generically use
	# readlink on all platforms, since it behaves slightly differently, and only
	# the OS X platform seems to exhibit this problem.
	ifeq ($(SYS),Darwin)
		B2GBIND=`readlink b2g-bindir-symlink`
	else
		B2GBIND := b2g-bindir-symlink
	endif
	RUNB2G := $(B2GBIND)/b2g-bin
endif

# Best effort use RUNMOZ if its available otherwise ignore it.
RUNMOZ := $(wildcard $(B2GBIND)/run-mozilla.sh)

# Common test running logic.  Some test files are for both IMAP and ActiveSync.
# Some test files are just for one or the other.  xpcshell has a mechanism for
# specifying constraings on test files in xpcshell.ini, and we are using that.

SOLO_FILE ?= $(error Specify a test filename in SOLO_FILE when using check-interactive or check-one)

TESTRUNNER=$(CURDIR)/test/loggest-runner.js


# run all the tests listed in a test config file
define run-tests  # $(call run-tests)
	-rm -rf test-profile
	-mkdir -p test-profile/device-storage test-profile/fake-sdcard
	-$(RUNMOZ) $(RUNMOZFLAGS) $(RUNB2G) -app $(CURDIR)/test-runner/application.ini -no-remote -profile $(CURDIR)/test-profile --test-config $(CURDIR)/test/test-files.json --test-variant $(TEST_VARIANT) --test-log-enable "$(TEST_LOG_ENABLE)"
endef

# run one test
define run-one-test
	-rm -rf test-profile
	-mkdir -p test-profile/device-storage test-profile/fake-sdcard
	-$(RUNMOZ) $(RUNMOZFLAGS) $(RUNB2G) -app $(CURDIR)/test-runner/application.ini -no-remote -profile $(CURDIR)/test-profile --test-config $(CURDIR)/test/test-files.json --test-name $(SOLO_FILE) --test-variant $(TEST_VARIANT) --test-log-enable "$(TEST_LOG_ENABLE)"
endef

define run-no-test
	-rm -rf $(2)
	-mkdir -p $(2)/device-storage $(2)/fake-sdcard
	-$(RUNMOZ) $(RUNMOZFLAGS) $(RUNB2G) -app $(CURDIR)/test-runner/application.ini -no-remote -profile $(CURDIR)/$(2) --test-config $(CURDIR)/test/test-files.json --test-command "$(1)" --test-log-enable "true" --test-arg "$(3)"
endef


######################
# All tests

.PHONY: test-deps
test-deps: node_modules
	-mkdir -p logic-inspector/test-logs
	-ln -s logic-inspector/test-logs
	-cd logic-inspector; make

# If our package.json has been updated, run npm install
node_modules: package.json
	npm install
	touch node_modules

tests: build test-deps
	$(call run-tests)

one-test: build test-deps
	$(call run-one-test)

# wrap one-test with gdb flags to RUNMOZ.  Abstraction so I don't have to
# remember this and because when we shift to using mach or such then it can
# be a transparent change, etc.
gdb-one-test: RUNMOZFLAGS=-g
# turn off the JIT's auto-segfault magic.
gdb-one-test: export JS_NO_SIGNALS=1
gdb-one-test: export JS_DISABLE_SLOW_SCRIPT_SIGNALS=1
gdb-one-test: one-test

post-one-test: one-test
post-tests: tests

######################
# Bundle up all the tests!

all-tests: tests

ACTIVESYNC_SERVER_PORT ?= 8880

FAKE_ACTIVESYNC_PROFILE=fake-activesync-server-profile
activesync-server:
	$(call run-no-test,activesync-fake-server,$(FAKE_ACTIVESYNC_PROFILE))

FAKE_IMAP_PROFILE=fake-imap-server-profile
imap-server:
	$(call run-no-test,imap-fake-server,$(FAKE_IMAP_PROFILE))

DOMAIN ?= $(error You need to specify DOMAIN=thedomain.duh when using autoconfig)
GENERIC_RUN_PROFILE=generic-profile
autoconfig:
	$(call run-no-test,autoconfig,$(GENERIC_RUN_PROFILE),$(DOMAIN))

.PHONY: results
results:
	xdg-open logic-inspector/index.html &> /dev/null || open logic-inspector/index.html &> /dev/null

clean:
	rm -rf build
	rm -rf data/deps
	rm -rf node-transformed-deps
	-rm test-logs/*.json

.DEFAULT_GOAL=help
.PHONY: build install-into-gaia

b2g: node_modules
	./node_modules/.bin/mozilla-download \
		--product b2g-desktop \
		--branch mozilla-central \
		./
	ln -nsf ./b2g b2g-bindir-symlink
