$(document).ready(function(){

  $("#nav-toggle").click(function(){
    if ($(".nav").css("display")=="none"){
      $(".nav").css("display", "inherit");
      $(".nav").css("box-shadow", "4px 0 8px 0 rgba(0, 0, 0, 0.2), 6px 0 20px 0 rgba(0, 0, 0, 0.19)");
      $("#nav-toggle").removeClass("lnr lnr-menu");
      $("#nav-toggle").addClass("lnr lnr-cross");
    } else {
      $(".nav").css("display", "none");
      $("#nav-toggle").removeClass("lnr lnr-cross");
      $("#nav-toggle").addClass("lnr lnr-menu");
    }
  })

  $(".nav>a").click(function(){
    $(".nav").css("display", "none");
  })

})
