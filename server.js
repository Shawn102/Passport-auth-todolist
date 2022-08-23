require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const findOrCreate = require("mongoose-findorcreate");

// Creating my express app
const app = express();

mongoose.connect(
  `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@cluster0.kevpvti.mongodb.net/multiUserDB`
);

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.LITTLE_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

const userTodoListSchema = new mongoose.Schema({
  title: String,
  content: String,
});
const TodoModel = mongoose.model("List", userTodoListSchema);

// My main schema
const usersSchema = new mongoose.Schema({
  fullname: String,
  username: String,
  phone: String,
  password: String,
  googleId: String,
  githubId: String,
  userSecret: String,
  todos: [userTodoListSchema],
});

// Using the plugin to my schema
usersSchema.plugin(passportLocalMongoose);
usersSchema.plugin(findOrCreate);

const User = mongoose.model("User", usersSchema);

passport.use(User.createStrategy());

passport.serializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, {
      id: user.id,
      username: user.username,
    });
  });
});

passport.deserializeUser(function (user, cb) {
  process.nextTick(function () {
    return cb(null, user);
  });
});

// Using google-auth strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://secret-todolist.herokuapp.com/auth/google/submit",
    },
    function (accessToken, refreshToken, profile, cb) {
      User.findOrCreate({ googleId: profile.id }, function (err, user) {
        return cb(err, user);
      });
    }
  )
);

// Using github-auth strategy
passport.use(
  new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: "http://localhost:3500/auth/github/submit",
    },
    function (accessToken, refreshToken, profile, done) {
      User.findOrCreate({ githubId: profile.id }, function (err, user) {
        return done(err, user);
      });
    }
  )
);

// Google authentication
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile"] })
);

app.get(
  "/auth/google/submit",
  passport.authenticate("google", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect "secret submit page".
    res.redirect("/submit");
  }
);
// Github authentication
app.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"] })
);

app.get(
  "/auth/github/submit",
  passport.authenticate("github", { failureRedirect: "/login" }),
  function (req, res) {
    // Successful authentication, redirect secret submit page".
    res.redirect("/submit");
  }
);

app.get("/", (req, res) => {
  User.find({ userSecret: { $ne: null } }, (err, foundAllUserSecret) => {
    if (err) {
      console.log(err);
    } else {
      if (foundAllUserSecret) {
        res.render("home", { sec: foundAllUserSecret });
      }
    }
  });
});
app.get("/submit", (req, res) => {
  if (req.isAuthenticated()) {
    const UserID = req.user.id;
    User.findById(UserID, (err, foundUser) => {
      if (!err) {
        if (foundUser) {
          res.render("submit", { todoItems: foundUser.todos });
        }
      } else {
        console.log(err);
      }
    });
  } else {
    res.redirect("/login");
  }
});
app.get("/register", (req, res) => {
  res.render("register");
});
app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (!err) {
      res.redirect("/");
    } else {
      console.log(err);
    }
  });
});

app.post("/register", (req, res) => {
  User.register(
    {
      fullname: req.body.fullname,
      username: req.body.username,
      phone: req.body.phonenumber,
    },
    req.body.password,
    (err, user) => {
      if (err) {
        console.log(err);
        res.render("failed");
      } else {
        passport.authenticate("local")(req, res, () => {
          res.redirect("/submit");
        });
      }
    }
  );
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/submit",
    failureRedirect: "/",
  }),
  (req, res, next) => {}
);

app.post("/secret", (req, res) => {
  const secretText = req.body.secretText;
  const userID = req.user.id;

  User.findById(userID, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      foundUser.userSecret = secretText;
      foundUser.save().then(() => res.redirect("/"));
    }
  });
});

app.post("/todolist", (req, res) => {
  const workFlow = new TodoModel({
    title: req.body.title,
    content: req.body.content,
  });
  const userId = req.user.id;

  User.findById(userId, (err, foundUser) => {
    if (err) {
      console.log(err);
    } else {
      if (foundUser) {
        foundUser.todos.push(workFlow);
        foundUser.save().then(() => res.redirect("/submit"));
      }
    }
  });
});

app.post("/deletelist", (req, res) => {
  const userid = req.user.id;
  const targetId = req.body.deleteButton;
  console.log(targetId);
  console.log("User id" + userid);

  User.findOneAndUpdate(
    { _id: userid },
    { $pull: { todos: { _id: targetId } } },
    (err) => {
      if (err) {
        console.log(err);
      } else {
        console.log("Successfully deleted the item from your db.");
      }
    }
  );
  res.redirect("/submit");
});

const port = process.env.PORT || 3500;
app.listen(port, () => {
  console.log(`Your app started on port ${port}`);
});
