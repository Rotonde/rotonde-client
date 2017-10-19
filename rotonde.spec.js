require("./rotonde");

let rotonde;
const mockClientUrl = "dat://mock/";

const realCreateElement = document.createElement;
const realGetElementsByTagName = document.getElementsByTagName;
const realAppendChild = document.appendChild;
const realWindowScrollTo = window.scrollTo;

global.console.info = jest.fn();
global.console.log = jest.fn();
global.console.error = jest.fn();

describe("Rotonde", () => {
  beforeEach(() => {
    rotonde = new window.Rotonde(mockClientUrl);
    global.r = rotonde;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it("SHOULD create a new instance", () => {
    expect(rotonde.client_url).toBe(mockClientUrl);
    expect(rotonde.requirements).toEqual({
      style: ["reset", "fonts", "main"],
      script: ["portal", "feed", "entry", "operator"]
    });
    expect(rotonde.includes).toEqual({ script: [] });
    expect(rotonde.portal).toEqual(null);
    expect(rotonde.feed).toEqual(null);
    expect(rotonde.operator).toEqual(null);

    expect(rotonde.el).toMatchSnapshot();
  });

  describe("install()", () => {
    beforeEach(() => {
      rotonde.install_script = jest.fn();
      rotonde.install_style = jest.fn();
    });

    it("SHOULD install the scripts and styles", () => {
      rotonde.install();

      expect(rotonde.install_script).toHaveBeenCalledWith("portal");
      expect(rotonde.install_script).toHaveBeenCalledWith("feed");
      expect(rotonde.install_script).toHaveBeenCalledWith("entry");
      expect(rotonde.install_script).toHaveBeenCalledWith("operator");

      expect(rotonde.install_style).toHaveBeenCalledWith("reset");
      expect(rotonde.install_style).toHaveBeenCalledWith("fonts");
      expect(rotonde.install_style).toHaveBeenCalledWith("main");
      expect(rotonde.install_style).toHaveBeenCalledWith("custom", true);
    });
  });

  describe("install_*", () => {
    const appendChild = jest.fn();

    beforeEach(() => {
      document.createElement = jest.fn(element => ({
        element
      }));
      document.getElementsByTagName = jest.fn(element => [
        {
          appendChild
        }
      ]);
    });

    afterEach(() => {
      document.createElement = realCreateElement;
      document.getElementsByTagName = realGetElementsByTagName;
    });

    describe("install_style()", () => {
      it("SHOULD append the stylesheet to the head", () => {
        rotonde.install_style("name");

        expect(document.getElementsByTagName).toHaveBeenCalledWith("head");
        expect(appendChild).toHaveBeenCalledWith({
          element: "link",
          rel: "stylesheet",
          type: "text/css",
          href: `${mockClientUrl}links/name.css`
        });
      });

      it("SHOULD append a user-side stylesheet to the head", () => {
        rotonde.install_style("name", true);

        expect(document.getElementsByTagName).toHaveBeenCalledWith("head");
        expect(appendChild).toHaveBeenCalledWith({
          element: "link",
          rel: "stylesheet",
          type: "text/css",
          href: `links/name.css`
        });
      });
    });

    describe("install_script()", () => {
      it("SHOULD append the script to the head", () => {
        rotonde.install_script("name");

        expect(document.getElementsByTagName).toHaveBeenCalledWith("head");
        expect(appendChild).toHaveBeenCalledWith({
          element: "script",
          type: "text/javascript",
          src: `${mockClientUrl}scripts/name.js`
        });
      });
    });
  });

  describe("confirm()", () => {
    beforeEach(() => {
      rotonde.verify = jest.fn();
    });

    it("SHOULD add the file to the includes and verify", () => {
      rotonde.confirm("script", "name");

      expect(rotonde.includes).toMatchObject({
        script: ["name"]
      });
      expect(rotonde.verify).toHaveBeenCalled();
    });
  });

  describe("verify()", () => {
    beforeEach(() => {
      rotonde.start = jest.fn();
    });

    describe("GIVEN no requirements", () => {
      it("SHOULD start rotonde", () => {
        rotonde.requirements.script = [];

        rotonde.verify();

        expect(rotonde.start).toHaveBeenCalled();
      });
    });

    describe("GIVEN missing requirements", () => {
      it("SHOULD NOT start rotonde", () => {
        rotonde.requirements.script = ["foo", "bar", "baz"];
        rotonde.includes.script = ["foo", "bar"];

        rotonde.verify();

        expect(rotonde.start).not.toHaveBeenCalled();
      });
    });

    describe("GIVEN all requirements are fulfilled", () => {
      it("SHOULD start rotonde", () => {
        rotonde.requirements.script = ["foo", "bar", "baz"];
        rotonde.includes.script = ["foo", "bar", "baz"];

        rotonde.verify();

        expect(rotonde.start).toHaveBeenCalled();
      });
    });
  });

  describe("start()", () => {
    beforeEach(() => {
      global.Operator = jest.fn(() => ({
        install: () => {}
      }));
      rotonde.load_account = jest.fn();
    });

    it("SHOULD install rotonde on the body", () => {
      rotonde.start();

      expect(document.body).toMatchSnapshot();
    });

    it("SHOULD create and install the operator", () => {
      const install = jest.fn();
      global.Operator = jest.fn(() => ({
        install
      }));

      rotonde.start();

      expect(global.Operator).toHaveBeenCalled();
      expect(install).toHaveBeenCalledWith(rotonde.el);
    });

    it("SHOULD load the account", () => {
      rotonde.start();

      expect(rotonde.load_account).toHaveBeenCalled();
    });
  });

  describe("load_account()", () => {
    let archive = {};
    let portalInstall = jest.fn();

    beforeEach(() => {
      global.DatArchive = jest.fn(() => archive);
      global.Portal = jest.fn(() => ({
        install: portalInstall
      }));
      archive.getInfo = jest.fn(() => ({
        isOwner: true
      }));
      archive.readFile = jest.fn(() => Promise.resolve(JSON.stringify({})));
      archive.writeFile = jest.fn(() => Promise.resolve());
    });

    it("SHOULD load the archive from the window.location", async () => {
      await rotonde.load_account();

      expect(global.DatArchive).toHaveBeenCalledWith("about:blank");
    });

    describe("GIVEN a portal.json", () => {
      let mockPortalData = {
        dat: "about:blank",
        name: "@name",
        desc: "description",
        site: "site",
        port: [],
        feed: []
      };

      beforeEach(() => {
        archive.readFile = jest.fn(() =>
          Promise.resolve(JSON.stringify(mockPortalData))
        );
      });

      it("SHOULD install the existing portal", async () => {
        await rotonde.load_account();

        expect(archive.readFile).toHaveBeenCalledWith("/portal.json");
        expect(global.Portal).toHaveBeenCalledWith(mockPortalData);
        expect(portalInstall).toHaveBeenCalledWith(rotonde.el);
      });
    });

    describe("GIVEN no portal.json", () => {
      let mockPortalData = {
        dat: "about:blank",
        name: "@name",
        desc: "description",
        site: "site",
        port: [],
        feed: []
      };

      beforeEach(() => {
        archive.readFile = jest.fn(() => Promise.reject());
        global.r.create_portal = jest.fn(() => mockPortalData);
      });

      it("SHOULD create a new portal.json with the defaults", async () => {
        await rotonde.load_account();

        expect(archive.writeFile).toHaveBeenCalledWith(
          "/portal.json",
          JSON.stringify(mockPortalData, null, 2)
        );
      });
    });

    describe("GIVEN a malformed portal.json", () => {
      beforeEach(() => {
        archive.readFile = jest.fn(() => Promise.resolve('{ "foo": {'));
      });

      it("SHOULD log an error", async () => {
        try {
          await rotonde.load_account();
        } catch (err) {
          // TODO: fix load_account so it doesn't throw an error here but fails gracefully
          // TypeError: Cannot set property 'dat' of undefined
        }

        expect(global.console.error).toHaveBeenCalledWith(
          "Malformed JSON in portal.json"
        );
      });
    });
  });

  describe("create_portal()", () => {
    let archive = {};

    beforeEach(() => {
      global.DatArchive = jest.fn(() => archive);
      archive.readFile = jest.fn(() =>
        Promise.resolve(
          JSON.stringify({
            title: "title"
          })
        )
      );
      r.portal = { archive };
    });

    it("SHOULD load the archive from the window.location", () => {
      rotonde.create_portal();

      expect(global.DatArchive).toHaveBeenCalledWith("about:blank");
    });

    it("SHOULD create a portal with the title", async () => {
      const portal = await rotonde.create_portal();

      expect(portal).toEqual({
        name: "title",
        desc: "new_desc",
        port: [],
        feed: [],
        site: "",
        dat: ""
      });
    });

    describe("GIVEN a multi word title", () => {
      beforeEach(() => {
        archive.readFile = jest.fn(() =>
          Promise.resolve(
            JSON.stringify({
              title: "title foo bar"
            })
          )
        );
      });

      it("SHOULD merge the title words", async () => {
        const portal = await rotonde.create_portal();

        expect(portal).toMatchObject({
          name: "titlefoobar"
        });
      });
    });
  });

  describe("load_feed", () => {
    let install;

    beforeEach(() => {
      install = jest.fn();
      global.Feed = jest.fn(() => ({
        install
      }));
    });

    it("SHOULD install the feed", async () => {
      const mockFeed = "feed";
      await rotonde.load_feed(mockFeed);

      expect(global.Feed).toHaveBeenCalledWith(mockFeed);
      expect(install).toHaveBeenCalledWith(rotonde.el);
    });
  });

  describe("mouse_down()", () => {
    let inject;

    beforeEach(() => {
      inject = jest.fn();
      global.r.operator = {
        inject
      };
      window.scrollTo = jest.fn();
    });

    afterEach(() => {
      window.scrollTo = realWindowScrollTo;
    });

    describe("GIVEN an element without a data-operation", () => {
      it("SHOULD not do anything", () => {
        const element = {
          target: {
            getAttribute: () => false
          },
          preventDefault: jest.fn()
        };
        rotonde.mouse_down(element);

        expect(element.preventDefault).not.toHaveBeenCalled();
        expect(inject).not.toHaveBeenCalled();
        expect(global.window.scrollTo).not.toHaveBeenCalled();
      });
    });

    describe("GIVEN an element with a data-operation", () => {
      it("SHOULD inject the operation into the operator and scroll to the top", () => {
        const element = {
          target: {
            getAttribute: () => "value"
          },
          preventDefault: jest.fn()
        };
        rotonde.mouse_down(element);

        expect(element.preventDefault).toHaveBeenCalled();
        expect(inject).toHaveBeenCalledWith("value");
        expect(global.window.scrollTo).toHaveBeenCalledWith(0, 0);
      });
    });
  });

  describe("reset()", () => {
    beforeEach(() => {
      rotonde.reset_with_name = jest.fn();
    });

    it("SHOULD call reset_with_name()", () => {
      rotonde.reset();

      expect(rotonde.reset_with_name).toHaveBeenCalled();
    });
  });

  describe("reset_with_name()", () => {
    let save;
    let archive = {};

    beforeEach(() => {
      save = jest.fn();
      global.DatArchive = jest.fn(() => archive);
      archive.readFile = jest.fn(() =>
        Promise.resolve(
          JSON.stringify({
            title: "title"
          })
        )
      );
      rotonde.portal = {
        archive,
        save
      };
      global.r.portal = rotonde.portal;
    });

    it("SHOULD ...", async () => {
      await rotonde.reset_with_name();

      expect(global.DatArchive).toHaveBeenCalledWith("about:blank");
      expect(archive.readFile).toHaveBeenCalledWith("/dat.json");
      expect(rotonde.portal.data).toEqual({
        name: "title",
        desc: "new_desc",
        port: [],
        feed: [],
        site: "",
        dat: ""
      });
    });

    describe("GIVEN a multi word title", () => {
      beforeEach(() => {
        archive.readFile = jest.fn(() =>
          Promise.resolve(
            JSON.stringify({
              title: "title foo bar"
            })
          )
        );
      });

      it("SHOULD merge the title words", async () => {
        await rotonde.reset_with_name();

        expect(rotonde.portal.data).toMatchObject({
          name: "titlefoobar"
        });
      });
    });
  });
});
