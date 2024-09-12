require('dotenv').config(); 
const sanitizeHtml = require('sanitize-html');
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const multer = require("multer");
const mongoose = require("mongoose");
const path = require("path");
const axios = require("axios");
const session = require("express-session");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const fs = require('fs');

const app = express();

mongoose.connect(process.env.MONGODB_URI);

const postSchema = new mongoose.Schema({
  title: String,
  body: String,
  image: String,
  link: String,
  tags: String,
  category: String
}, {
  timestamps: true 
});

const Post = mongoose.model("Post", postSchema);

const contactSchema = new mongoose.Schema({
  name: String,
  email: String,
  message: String,
});
const Contact = mongoose.model("Contact", contactSchema);

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
});
const Admin = mongoose.model("Admin", adminSchema);

const storage = multer.diskStorage({
  destination: "public/uploads/",
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });

app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'defaultsecret', // Ensure this is defined in your .env file
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, 
  })
);

// Set up Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Fetch recent posts middleware
app.use(async (req, res, next) => {
  try {
    const recentPosts = await Post.find({}).sort({ _id: -1 }).limit(4);
    res.locals.recentPosts = recentPosts;  // Pass recentPosts to all views
    next();
  } catch (err) {
    console.error("Error fetching recent posts:", err);
    next();  // Proceed to the next middleware even if there is an error
  }
});

// Route for home page
app.get("/", async function (req, res) {
  try {
    const posts = await Post.find({});
    res.render("home", {
      homeStartingContent: "",
      posts: posts,
      recentPosts: res.locals.recentPosts,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});

// Route for about page
app.get('/about', async (req, res) => {
  try {
    res.render('about', {
      recentPosts: res.locals.recentPosts
    });
  } catch (err) {
    console.error('Error fetching recent posts:', err);
    res.render('about', { recentPosts: [] });
  }
});

// Route for weather page
app.get("/weather", async function (req, res) {
  try {
    const posts = await Post.find({ category: "Weather" });
    res.render("weather", {
      weather: null,
      posts: posts,
      isWeatherPage: true,
      recentPosts: res.locals.recentPosts,
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Internal Server Error");
  }
});

// Handle weather data POST request
app.post('/weather', async (req, res) => {
  const location = req.body.location;
  const apiKey = process.env.WEATHER_API_KEY;
  const apiUrl = `https://api.openweathermap.org/data/2.5/weather?q=${location}&appid=${apiKey}&units=metric`;

  try {
    const response = await axios.get(apiUrl);
    const weatherData = response.data;
    const posts = await Post.find({ category: 'Weather' });
    res.render("weather", {
      weather: weatherData,
      posts: posts,
      isWeatherPage: true,
      recentPosts: res.locals.recentPosts,
    });
  } catch (error) {
    console.log(error);
    res.status(500).render("error");
  }
});

// Route for contact page
app.get("/contact", function (req, res) {
  res.render("contact", {
    recentPosts: res.locals.recentPosts,
  });
});

// Handle contact form submission
app.post("/contact", function (req, res) {
  const contact = new Contact({
    name: req.body.name,
    email: req.body.email,
    message: req.body.message,
  });

  contact
    .save()
    .then(function () {
      const mailOptions = {
        from: 'no-reply@techalphahub.com',
        to: process.env.EMAIL_USER,
        subject: 'New Contact Form Message',
        text: `You have received a new message from ${req.body.name} (${req.body.email}): \n\n${req.body.message}`,
      };

      transporter.sendMail(mailOptions, function (err, info) {
        if (err) {
          console.log("Error sending email:", err);
        } else {
          console.log("Email sent successfully: " + info.response);
        }
      });

      res.redirect("/thank-you");
    })
    .catch(function (err) {
      console.log("Error saving contact to the database:", err);
      res.status(500).send("Internal Server Error");
    });
});

// Route for thank-you page
app.get("/thank-you", function (req, res) {
  res.render("thank-you");
});

// Route to show compose form
app.get("/compose", function (req, res) {
  if (req.session.admin) {
    res.render("compose", { admin: req.session.admin });
  } else {
    res.redirect("/admin/login");
  }
});

// Handle post submission
app.post("/compose", upload.single("image"), function (req, res) {
  const post = new Post({
    title: req.body.title,
    body: req.body.content,
    image: req.file ? req.file.filename : null,
    link: req.body.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
    tags: req.body.tags,
    category: req.body.category,
  });

  post
    .save()
    .then(function () {
      res.redirect("/");
    })
    .catch(function (err) {
      console.log(err);
      res.status(500).send("Internal Server Error");
    });
});

// app.post("/compose", upload.single("image"), function (req, res) {
//   const post = new Post({
//     title: req.body.title,
//     body: req.body.content, // This now contains HTML from TinyMCE
//     image: req.file ? req.file.filename : null,
//     link: req.body.title.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
//     tags: req.body.tags,
//     category: req.body.category,
//   });

//   post
//     .save()
//     .then(function () {
//       res.redirect("/");
//     })
//     .catch(function (err) {
//       console.log(err);
//       res.status(500).send("Internal Server Error");
//     });
// });


// Route for individual posts
app.get("/posts/:link", function (req, res) {
  Post.findOne({ link: req.params.link })
    .then(function (post) {
      if (post) {
        res.render("post", { post: post, tags: post.tags });
      } else {
        res.status(404).send("Post not found");
      }
    })
    .catch(function (err) {
      console.log(err);
      res.status(500).send("Internal Server Error");
    });
});

// Admin routes

app.get("/admin/signup", function (req, res) {
  res.render("admin/signup");
});

app.post("/admin/signup", function (req, res) {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;

  const admin = new Admin({
    name: name,
    email: email,
    password: password,
  });

  admin
    .save()
    .then(function () {
    res.redirect('/signup-thankyou');
    })
    .catch(function (err) {
      console.log(err);
      res.status(500).send("Oops! That email has already been used, Please Use another email");
    });
});

app.get("/admin/login", function (req, res) {
  res.render("admin/login");
});

app.post("/admin/login", function (req, res) {
  const email = req.body.email;
  const password = req.body.password;

  Admin.findOne({ email: email, password: password })
    .then(function (admin) {
      if (admin) {
        req.session.admin = admin;
        res.redirect("dashboard");
      } else {
        res.render("admin/login", {
          error: "Invalid email or password",
        });
      }
    })
    .catch(function (err) {
      console.log(err);
      res.status(500).send("Internal Server Error");
    });
});

// Route for admin dashboard
app.get("/admin/dashboard", async function (req, res) {
  if (!req.session.admin) {
    return res.redirect("/admin/login"); // Redirect to login if admin is not logged in
  }

  try {
    // Fetch total number of posts
    const totalPosts = await Post.countDocuments({});

    // Fetch distinct categories from posts
    const categories = await Post.distinct("category");
    const totalCategories = categories.length;

    // Fetch recent posts (last 5, for example)
    const recentPosts = await Post.find({}).sort({ _id: -1 }).limit(5);
    const totalRecentPosts = recentPosts.length;

    // Render the dashboard and pass the data to the template
    res.render("admin/dashboard", {
      totalPosts: totalPosts,
      totalCategories: totalCategories,
      totalRecentPosts: totalRecentPosts,
      admin: req.session.admin, // Pass admin data for other potential use
    });
  } catch (err) {
    console.log("Error loading admin dashboard:", err);
    res.status(500).send("Internal Server Error");
  }
});


app.get("/admin/logout", function (req, res) {
  res.render("admin/logout");
});

app.post("/admin/logout", function (req, res) {
  // Check if the user is authenticated before destroying the session
  if (req.session.admin) {
    req.session.destroy(function (err) {
      if (err) {
        console.log(err);
        res.status(500).send("Internal Server Error");
      } else {
        // Redirect to the login page after a brief delay
        setTimeout(function() {
          res.redirect("/");
        }, 2000); // Adjust the delay time as needed
      }
    });
  } else {
    // If the user is not authenticated, redirect to the login page directly
    res.redirect("admin/login");
  }
});

app.get("/signup-thankyou", function(req, res) {
  res.render("signup-thankyou");
});

app.get("/admin/categories", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  try {
    // Fetch all distinct categories from the Post collection
    const categories = await Post.distinct("category");

    // Render the categories view and pass the categories data
    res.render("admin/categories", { categories });
  } catch (err) {
    console.log("Error fetching categories:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/admin/add-category", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  const { category } = req.body;

  try {
    // Check if the category already exists
    const existingCategory = await Post.findOne({ category });
    if (existingCategory) {
      return res.send("Category already exists");
    }

    // Add a new post with the category to the Post model (or modify based on your structure)
    await Post.create({ category });

    // Redirect back to the categories page
    res.redirect("/admin/categories");
  } catch (err) {
    console.log("Error adding category:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/admin/delete-category/:category", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  const categoryToDelete = req.params.category;

  try {
    // Remove the posts belonging to this category
    await Post.deleteMany({ category: categoryToDelete });

    // Optionally, you can remove the category from posts or implement a more nuanced deletion process.
    
    // Redirect back to the categories page
    res.redirect("/admin/categories");
  } catch (err) {
    console.log("Error deleting category:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/admin/posts", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  try {
    // Fetch all posts from the Post collection
    const posts = await Post.find();

    // Render the posts view and pass the posts data
    res.render("admin/posts", { posts });
  } catch (err) {
    console.log("Error fetching posts:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/posts/:link", async (req, res) => {
  try {
    // Find the post by its link
    const post = await Post.findOne({ link: req.params.link });

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Render the post's public view
    res.render("posts/view", { post });
  } catch (err) {
    console.log("Error fetching post:", err);
    res.status(500).send("Internal Server Error");
  }
});
// GET route to render the edit post form
app.get("/admin/edit-post/:id", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  try {
    // Find the post by its ID
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Render the edit form with the post data
    res.render("admin/edit-post", { post });
  } catch (err) {
    console.log("Error fetching post for edit:", err);
    res.status(500).send("Internal Server Error");
  }
});

// POST route to handle post updates
app.post("/admin/edit-post/:id", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  const { title, category, content } = req.body;

  try {
    // Update the post with new values
    await Post.findByIdAndUpdate(req.params.id, { title, category, content });

    // Redirect to the admin posts page
    res.redirect("/admin/posts");
  } catch (err) {
    console.log("Error updating post:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/admin/delete-post/:id", async (req, res) => {
  if (!req.session.admin) {
    return res.redirect("/admin/login");
  }

  try {
    // Delete the post by its ID
    await Post.findByIdAndDelete(req.params.id);

    // Redirect back to the admin posts page
    res.redirect("/admin/posts");
  } catch (err) {
    console.log("Error deleting post:", err);
    res.status(500).send("Internal Server Error");
  }
});
app.get('/admin/recentPosts', async (req, res) => {
  try {
    // Fetch recent posts from the database
    const posts = await Post.find({}).sort({ createdAt: -1 }).limit(10); // Adjust limit as needed

    // Render the recentPosts view and pass the posts
    res.render('admin/recentPosts', { posts });
  } catch (err) {
    console.error('Error fetching recent posts:', err);
    res.status(500).send('Internal Server Error');
  }
});

app.get("/admin/post/:id", async (req, res) => {
  try {
    // Find the post by ID
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Render the post details page
    res.render("admin/post-details", { post });
  } catch (err) {
    console.log("Error fetching post details:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get('/admin/post/:id', async (req, res) => {
  try {
    // Find the post by ID
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).send("Post not found");
    }

    // Render the post details page with correct path
    res.render('admin/post-details', { post });
  } catch (err) {
    console.log("Error fetching post details:", err);
    res.status(500).send("Internal Server Error");
  }
});


const subscriberSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true, // Ensures no duplicate email addresses
    lowercase: true,
    trim: true,
  },

  name: {
    type: String,
  },
}, { timestamps: true });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

const sendThankYouEmail = async (to, name) => {
  try {
    const templatePath = path.join(__dirname, 'views', 'emailtemp.ejs');
    const template = fs.readFileSync(templatePath, 'utf8'); // Ensure fs is used here

    const html = ejs.render(template, { name });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: to,
      subject: 'Thank You for Subscribing!',
      html: html
    };

    await transporter.sendMail(mailOptions);
    console.log(`Thank you email sent successfully to ${to}`);
  } catch (error) {
    console.error(`Error sending thank you email to ${to}:`, error);
    throw error;
  }
};
app.post('/subscribe', async (req, res) => {
  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).send('Email and name are required');
  }

  try {
    // Check if the email is already subscribed
    const existingSubscriber = await Subscriber.findOne({ email });
    if (existingSubscriber) {
      console.log('Email is already subscribed:', email);
      return res.status(400).send('Email is already subscribed');
    }

    // Create a new subscriber record
    const newSubscriber = new Subscriber({ email, name });
    await newSubscriber.save();
    console.log('New subscriber added:', email);

    // Send a thank-you email
    await sendThankYouEmail(email, name);

    // Redirect to Thank You page
    res.redirect('/thank-you-for-subscribing');
  } catch (error) {
    console.error('Error processing subscription:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/thank-you-for-subscribing', (req, res) => {
  res.render('thank-you-for-subscribing');
});



let port = process.env.PORT;
if (port == null || port == ""){
port = 3000;
}

// Start server
app.listen(process.env.PORT || 3000, function () {
  console.log("Server started on port 3000");
});
